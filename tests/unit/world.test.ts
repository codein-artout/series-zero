import { describe, expect, it } from "vitest";
import { gameConfig as cfg, deepMerge, defaultGameConfig, validateGameConfig } from "@/config/game";
import {
  boundRefinement,
  classifyHeadline,
  crashProbability,
  crashRiskSeason,
  herdSpike,
  hypeBand,
  hypeStep,
  newsImpact,
  newsShock,
  poolStep,
} from "@/lib/rules/world";
import { Rng } from "@/lib/rules/rng";
import { MockNewsProvider } from "@/lib/providers/news";
import { createWorld } from "@/lib/sim/genesis";
import { stepMarket } from "@/lib/sim/market";

describe("sector pools", () => {
  it("applies drift, hype, shock and noise multiplicatively", () => {
    const p = poolStep(100, 100, { drift: 0.01, volatility: 0, H: 50, shock: 0.02, z: 0 }, cfg);
    expect(p).toBeCloseTo(103);
    const hot = poolStep(100, 100, { drift: 0, volatility: 0, H: 100, shock: 0, z: 0 }, cfg);
    expect(hot).toBeCloseTo(100 * (1 + cfg.world.hypeGain));
  });
  it("clamps to [0.5, 2.0] x base", () => {
    expect(poolStep(100, 100, { drift: 0, volatility: 1, H: 50, shock: 0, z: -5 }, cfg)).toBe(50);
    expect(poolStep(190, 100, { drift: 0.5, volatility: 0, H: 50, shock: 0, z: 0 }, cfg)).toBe(200);
  });
});

describe("hype index", () => {
  it("mean-reverts, responds to news and herding, and stays in 0..100", () => {
    expect(hypeStep(70, 0, 0, 0, cfg)).toBeCloseTo(69);
    expect(hypeStep(50, 1, 0, 0, cfg)).toBeCloseTo(56);
    expect(hypeStep(50, 0, 0.5, 0, cfg)).toBeCloseTo(52);
    expect(hypeStep(99, 1, 1, 10, cfg)).toBe(100);
    expect(hypeStep(1, -1, 0, -10, cfg)).toBe(0);
  });
  it("news impact is clamped to [-1, 1]", () => {
    expect(newsImpact([{ sentiment: 1, magnitude: 1 }, { sentiment: 1, magnitude: 1 }])).toBe(1);
    expect(newsImpact([{ sentiment: -0.5, magnitude: 0.5 }])).toBeCloseTo(-0.25);
  });
  it("herd spike counts top-2 share above 0.4", () => {
    expect(herdSpike({}, cfg)).toBe(0);
    expect(herdSpike({ climate: 3, fintech: 1 }, cfg)).toBeCloseTo(0.6);
    expect(herdSpike({ climate: 1, fintech: 1, space: 1, health: 1, consumer: 1 }, cfg)).toBe(0);
  });
  it("bands", () => {
    expect([10, 30, 50, 72, 90].map((h) => hypeBand(h, cfg))).toEqual(["Frozen", "Cool", "Warm", "Hot", "Bubble"]);
  });
});

describe("crash", () => {
  it("probability is linear above the floor", () => {
    expect(crashProbability(55, cfg)).toBe(0);
    expect(crashProbability(80, cfg)).toBeCloseTo(0.00037 * 25);
    expect(crashRiskSeason(80, 56, cfg)).toBeCloseTo(1 - Math.pow(1 - 0.00925, 56));
    expect(crashRiskSeason(40, 100, cfg)).toBe(0);
  });
});

describe("news", () => {
  it("shock is sentiment x magnitude x maxShock spread over ticks", () => {
    const s = newsShock(0.8, 0.75, 1, cfg);
    expect(s.total).toBeCloseTo(0.8 * 0.75 * 0.12);
    expect(s.perTick * s.ticks).toBeCloseTo(s.total);
  });
  it("keyword classifier maps headlines to sectors and sentiment", () => {
    expect(classifyHeadline("Regulators open a review of stablecoin issuers")).toMatchObject({ sector: "fintech", kind: "regulation" });
    expect(classifyHeadline("Solid-state cell hits 480 Wh/kg in a lab demo").sector).toBe("climate");
    expect(classifyHeadline("Launch provider wins contract").sector).toBe("space");
  });
  it("LLM refinement stays inside the keyword bounds", () => {
    const r = boundRefinement({ sector: "fintech", sentiment: -0.6 }, { sector: "space", sentiment: 1 }, ["fintech", "space"]);
    expect(r.sentiment).toBeLessThanOrEqual(0);
    expect(boundRefinement({ sector: "fintech", sentiment: 0 }, { sector: "space", sentiment: 1 }, ["fintech"]).sentiment).toBeCloseTo(0.4);
  });
  it("mock provider emits about perTickProb events per tick, deterministically", async () => {
    const p = new MockNewsProvider();
    let n = 0;
    for (let t = 0; t < 2000; t++) n += (await p.fetch(t, Rng.fromString(`n${t}`), cfg)).length;
    expect(n / 2000).toBeGreaterThan(0.3);
    expect(n / 2000).toBeLessThan(0.4);
    const a = await p.fetch(5, Rng.fromString("same"), cfg);
    const b = await p.fetch(5, Rng.fromString("same"), cfg);
    expect(a).toEqual(b);
  });
});

describe("market step", () => {
  it("is deterministic and keeps pools in bounds over a season", async () => {
    const run = async () => {
      const w = createWorld("market-seed", cfg);
      for (let t = 1; t <= 270; t++) await stepMarket(w, cfg, t);
      return w;
    };
    const a = await run();
    const b = await run();
    expect(a.sectors.map((s) => s.pool)).toEqual(b.sectors.map((s) => s.pool));
    expect(a.season.hype).toBe(b.season.hype);
    for (const s of a.sectors) {
      const base = cfg.sectors.find((x) => x.id === s.id)!.basePoolAnnual;
      expect(s.pool).toBeGreaterThanOrEqual(base * 0.5);
      expect(s.pool).toBeLessThanOrEqual(base * 2);
    }
    expect(a.appended.events.length).toBeGreaterThan(50);
  });
  it("crashes the hottest sector when the roll hits", async () => {
    const hot = validateGameConfig(deepMerge(defaultGameConfig, { hype: { crashCoefficient: 1, start: 90, noise: 0 } }));
    const w = createWorld("crash-seed", hot);
    const before = w.season.hype;
    const r = await stepMarket(w, hot, 1);
    expect(r.crashed).not.toBeNull();
    expect(w.season.hype).toBeLessThan(before - 20);
    expect(w.appended.posts.some((p) => p.text.includes("Crash"))).toBe(true);
  });
});
