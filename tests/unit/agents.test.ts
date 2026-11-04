import { describe, expect, it } from "vitest";
import { gameConfig as cfg, SECTOR_IDS } from "@/config/game";
import {
  addMemory,
  applyDrift,
  boundTraits,
  driftDelta,
  drawHiddenStats,
  normalizeWeights,
  peerAverageWeights,
  reputationStep,
  seasonCarry,
  sectorMatchWithHerding,
  topMemories,
  type Weights,
} from "@/lib/rules/agents";
import { clampCapital, ideaQuality, jaccard, novelty, tokens } from "@/lib/rules/ideas";
import { Rng } from "@/lib/rules/rng";
import { createWorld } from "@/lib/sim/genesis";
import { createAcquirer, createCompany, createNpcFounder, createNpcFund, generateIdea } from "@/lib/sim/agents";
import { realNameHit } from "@/lib/safety/realnames";

const sum = (w: Weights) => SECTOR_IDS.reduce((a, s) => a + w[s], 0);

describe("traits and hidden stats", () => {
  it("form values are authoritative within maxDeviation", () => {
    const form = { riskAppetite: 0.5, ethics: 0.9, patience: 0.2, ambition: 0.5 };
    const b = boundTraits(form, { riskAppetite: 1, ethics: 0, patience: 0.25, ambition: Number.NaN }, cfg);
    expect(b.riskAppetite).toBeCloseTo(0.65);
    expect(b.ethics).toBeCloseTo(0.75);
    expect(b.patience).toBeCloseTo(0.25);
    expect(b.ambition).toBe(0.5);
  });
  it("hidden stats stay in range and DNA nudges by at most 0.05", () => {
    for (let i = 0; i < 200; i++) {
      const s = drawHiddenStats(Rng.fromString(`s${i}`), cfg);
      const n = drawHiddenStats(Rng.fromString(`s${i}`), cfg, "We ship fast, hire a great team and tell a great story.");
      for (const k of ["execution", "teamSeed", "charisma"] as const) {
        expect(s[k]).toBeGreaterThanOrEqual(cfg.stats.min);
        expect(s[k]).toBeLessThanOrEqual(cfg.stats.max);
        expect(n[k] - s[k]).toBeGreaterThanOrEqual(0);
        expect(n[k] - s[k]).toBeLessThanOrEqual(cfg.stats.dnaNudge + 1e-12);
      }
    }
  });
});

describe("thesis drift and herding", () => {
  const base = normalizeWeights({ climate: 0.2, devtools: 0.3, ai_infra: 0.3, fintech: 0.15, consumer: 0.05 }, cfg.vc.weightMin, cfg.vc.weightMax);
  it("normalises within clamps and sums to 1", () => {
    const w = normalizeWeights({ climate: 100, fintech: 0 }, cfg.vc.weightMin, cfg.vc.weightMax);
    expect(sum(w)).toBeCloseTo(1, 10);
    for (const s of SECTOR_IDS) {
      expect(w[s]).toBeGreaterThanOrEqual(cfg.vc.weightMin - 1e-12);
      expect(w[s]).toBeLessThanOrEqual(cfg.vc.weightMax + 1e-12);
    }
    expect(w.climate).toBeCloseTo(cfg.vc.weightMax);
  });
  it("positive events raise the sector weight by eta*tanh(ln m) before renormalising", () => {
    const d = driftDelta({ kind: "exit", multiple: 11.2 }, cfg);
    expect(d).toBeCloseTo(cfg.vc.drift.eta * Math.tanh(Math.log(11.2)));
    const after = applyDrift(base, "climate", d, cfg);
    expect(after.climate).toBeGreaterThan(base.climate);
    expect(sum(after)).toBeCloseTo(1, 10);
  });
  it("a multiple below 1 drifts down, write-offs drift down by eta*lossFactor", () => {
    expect(driftDelta({ kind: "markup", multiple: 0.5 }, cfg)).toBeLessThan(0);
    expect(driftDelta({ kind: "writeoff" }, cfg)).toBeCloseTo(-cfg.vc.drift.eta * cfg.vc.drift.lossFactor);
    const after = applyDrift(base, "fintech", driftDelta({ kind: "writeoff" }, cfg), cfg);
    expect(after.fintech).toBeLessThan(base.fintech);
    expect(after.fintech).toBeGreaterThanOrEqual(cfg.vc.weightMin - 1e-12);
  });
  it("herding pulls sectorMatch toward the peer average, scaled by fomo", () => {
    const peer = peerAverageWeights([normalizeWeights({ space: 1 }, cfg.vc.weightMin, cfg.vc.weightMax)]);
    const none = sectorMatchWithHerding(base, peer, "space", 0, cfg);
    const some = sectorMatchWithHerding(base, peer, "space", 0.3, cfg);
    const lots = sectorMatchWithHerding(base, peer, "space", 1.5, cfg);
    expect(none).toBeLessThan(some);
    expect(some).toBeLessThan(lots);
    expect(lots).toBeLessThanOrEqual(1);
    // never pulls down
    expect(sectorMatchWithHerding(base, peer, "ai_infra", 1.5, cfg)).toBeGreaterThanOrEqual(sectorMatchWithHerding(base, peer, "ai_infra", 0, cfg));
  });
});

describe("memory and reputation", () => {
  it("memory is capped and the prompt gets the top entries", () => {
    let m: ReturnType<typeof addMemory> = [];
    for (let t = 0; t < 60; t++) m = addMemory(m, { tick: t, type: "x", text: "y".repeat(500), salience: t === 3 ? 1 : 0.2 }, cfg);
    expect(m.length).toBe(cfg.agent.memory.maxEntries);
    expect(m.every((e) => e.text.length <= cfg.agent.memory.textMax)).toBe(true);
    expect(topMemories(m, 60, cfg)).toHaveLength(cfg.agent.memory.promptEntries);
  });
  it("reputation moves alpha of the way to target and carries over seasons", () => {
    expect(reputationStep(50, 100, cfg)).toBeCloseTo(57.5);
    expect(seasonCarry(80, 10, cfg)).toBeCloseTo(75);
    expect(seasonCarry(100, 100, cfg)).toBe(100);
  });
});

describe("idea quality", () => {
  it("jaccard and novelty", () => {
    expect(jaccard(tokens("soil drones farms"), tokens("soil drones farms"))).toBe(1);
    const n = novelty("soil sensing drones for farms", ["soil sensing drones for farms"], cfg);
    expect(n.duplicate).toBe(true);
    expect(novelty("ledger for ferries", ["soil drones"], cfg).novelty).toBe(1);
  });
  it("q formula, clamps and duplicate penalty", () => {
    const q = ideaQuality({ heatFit: 1, dnaFit: 0.9, novelty: 1, duplicate: false, noiseZ: 0 }, cfg);
    expect(q).toBeCloseTo(0.35 + 0.25 + 0.18 + 0.2);
    const dnaCheat = ideaQuality({ heatFit: 1, dnaFit: 5, novelty: 1, duplicate: false, noiseZ: 0 }, cfg);
    expect(dnaCheat).toBeCloseTo(q);
    const dup = ideaQuality({ heatFit: 1, dnaFit: 0.9, novelty: 0, duplicate: true, noiseZ: 0 }, cfg);
    expect(dup).toBeCloseTo(0.35 + 0.25 + 0.18 - 0.25);
    expect(ideaQuality({ heatFit: 0, dnaFit: 0, novelty: 0, duplicate: true, noiseZ: -10 }, cfg)).toBe(cfg.idea.qMin);
    expect(clampCapital(99_000_000, "seed", cfg)).toBe(3_000_000);
  });
});

describe("agent creation", () => {
  it("creates deterministic NPC founders, funds, acquirers and ideas with fictional names", async () => {
    const make = async () => {
      const w = createWorld("seed-x", cfg);
      const f = createNpcFounder(w, cfg, 0);
      const fund = createNpcFund(w, cfg, 0, { archetype: "skeptic" });
      const a = createAcquirer(w, cfg, 0);
      const g = await generateIdea(w, cfg, f, 0, { stage: "seed", source: "seed" });
      const c = createCompany(w, cfg, f, g.idea, g.name, 0);
      return { w, f, fund, a, g, c };
    };
    const one = await make();
    const two = await make();
    expect(one.f.name).toBe(two.f.name);
    expect(one.g.idea).toEqual(two.g.idea);
    expect(one.c.name).toBe(two.c.name);
    for (const n of [one.f.name, one.fund.name, one.a.name, one.c.name]) expect(realNameHit(n).hit).toBe(false);
    expect(one.g.idea.oneLiner.length).toBeLessThanOrEqual(cfg.idea.oneLinerMax);
    expect(one.g.idea.q).toBeGreaterThanOrEqual(cfg.idea.qMin);
    expect(one.w.ledger.check()).toEqual([]);
    expect(one.w.ledger.minted).toBe(cfg.fund.size + cfg.npc.treasury + cfg.company.startingCash);
    expect(sum(one.fund.sectorWeights)).toBeCloseTo(1, 10);
  });
});
