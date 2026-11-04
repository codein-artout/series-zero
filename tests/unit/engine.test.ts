import { describe, expect, it } from "vitest";
import { gameConfig as cfg, seasonTicks } from "@/config/game";
import { buildSeedWorld, populate } from "@/lib/sim/seedworld";
import { createWorld } from "@/lib/sim/genesis";
import { runTick, stabilizerFor, stateDigest } from "@/lib/sim/engine";
import { isDemoDayTick } from "@/lib/sim/demoday";
import { acceptOffer, declineOffer } from "@/lib/sim/offers";
import { visibleFeuds } from "@/lib/sim/feuds";
import type { World } from "@/lib/sim/types";

const SMALL = { founders: 20, vcs: 6, acquirers: 2 };

describe("tick engine", () => {
  it("conserves scrip on every tick of a full 270-tick season (fails loudly otherwise)", async () => {
    let checked = 0;
    const w = await buildSeedWorld(cfg, "conservation-seed", {
      ...SMALL,
      ticks: seasonTicks(cfg),
      demo: true,
      fraudster: true,
      onTick: (r, world) => {
        expect(world.ledger.check()).toEqual([]);
        expect(r.supply).toBe(r.minted - r.burned);
        checked++;
        world.appended.marks = [];
        world.ledger.drain();
      },
    });
    expect(checked).toBe(270);
    expect(w.season.revealed).toBe(true);
    expect([...w.companies.values()].every((c) => c.outcome !== null || c.status === "alive" || c.status === "zombie")).toBe(true);
  }, 300_000);

  it("same seed, same results: identical digests in two runs", async () => {
    const digests = async () => {
      const out: string[] = [];
      await buildSeedWorld(cfg, "determinism-seed", { ...SMALL, ticks: 60, demo: true, fraudster: true, onTick: (r) => void out.push(r.digest) });
      return out;
    };
    const a = await digests();
    const b = await digests();
    expect(a).toHaveLength(60);
    expect(a).toEqual(b);
    const c: string[] = [];
    await buildSeedWorld(cfg, "other-seed", { ...SMALL, ticks: 5, onTick: (r) => void c.push(r.digest) });
    expect(c[4]).not.toBe(a[4]);
  }, 120_000);

  it("refuses to run past the end of the season", async () => {
    const w = createWorld("end", cfg);
    w.season.tick = seasonTicks(cfg);
    await expect(runTick(w, cfg)).rejects.toThrow();
  });

  it("Demo Day runs on the evening tick of every 7th day", () => {
    expect(isDemoDayTick(21, cfg)).toBe(true);
    expect(isDemoDayTick(42, cfg)).toBe(true);
    expect(isDemoDayTick(20, cfg)).toBe(false);
    expect(isDemoDayTick(7, cfg)).toBe(false);
  });

  it("stabilizer pulls revenue down when supply is above target", async () => {
    const w = createWorld("stab", cfg);
    await populate(w, cfg, SMALL);
    w.season.targetSupply = w.ledger.supply();
    expect(stabilizerFor(w, cfg)).toBeCloseTo(1);
    w.season.targetSupply = w.ledger.supply() / 1.2;
    expect(stabilizerFor(w, cfg)).toBeCloseTo(1 - 1.5 * 0.2);
    w.season.targetSupply = w.ledger.supply() * 10;
    expect(stabilizerFor(w, cfg)).toBe(cfg.economy.stabilizerMax);
  });

  it("produces the seed-world features GAME.md asks for", async () => {
    const posts: number[] = [];
    let fraud = 0;
    let demoDays = 0;
    const w = await buildSeedWorld(cfg, cfg.seed.seasonSeed, {
      demo: true,
      fraudster: true,
      ticks: cfg.seed.ticks,
      onTick: (_r, world) => {
        posts.push(world.appended.posts.length);
        fraud += world.appended.posts.filter((p) => p.kind === "fraud").length;
        demoDays += world.appended.demoDays.length;
        world.appended.posts = [];
        world.appended.demoDays = [];
        world.appended.marks = [];
        world.ledger.drain();
      },
    });
    const cos = [...w.companies.values()];
    expect(cos.some((c) => c.rounds > 0)).toBe(true);
    expect(cos.some((c) => c.status === "dead")).toBe(true);
    expect(cos.filter((c) => c.mark >= cfg.outcome.unicornValuation || (c.exitPrice ?? 0) >= cfg.outcome.unicornValuation).length).toBeGreaterThanOrEqual(3);
    expect(cos.some((c) => c.status === "acquired")).toBe(true);
    const drifted = [...w.funds.values()].filter((f) => Object.keys(f.sectorWeights).some((k) => Math.abs(f.sectorWeights[k as keyof typeof f.sectorWeights] - f.startWeights[k as keyof typeof f.startWeights]) > 0.03));
    expect(drifted.length).toBeGreaterThanOrEqual(4);
    expect(posts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(100);
    expect(fraud).toBeGreaterThanOrEqual(1);
    expect(visibleFeuds(w, cfg).length).toBeGreaterThanOrEqual(1);
    expect(demoDays).toBeGreaterThanOrEqual(2);
    expect([...w.decisions.values()].some((d) => d.status === "open" && d.userId === "user_demo")).toBe(true);
  }, 300_000);
});

describe("player agency", () => {
  it("accepting versus declining a term sheet visibly changes the outcome", async () => {
    const mk = async () => {
      const w = createWorld("agency-seed", cfg);
      await populate(w, cfg, { ...SMALL, demo: true });
      const { startDemoCompany } = await import("@/lib/sim/seedworld");
      await startDemoCompany(w, cfg, 0);
      return w;
    };
    const a = await mk();
    const b = await mk();
    const findOffer = (w: World) => [...w.offers.values()].find((x) => x.status === "open" && w.founders.get(w.companies.get(x.companyId)!.founderId)?.ownerId);
    for (let i = 0; i < 200 && !findOffer(a); i++) {
      await runTick(a, cfg);
      await runTick(b, cfg);
    }
    const oa = findOffer(a)!;
    const ob = b.offers.get(oa.id)!;
    expect(oa).toBeDefined();
    expect(stateDigest(a)).toBe(stateDigest(b));
    const tick = a.season.tick;
    const res = await acceptOffer(a, cfg, oa, tick, "player");
    expect(res.ok).toBe(true);
    declineOffer(b, cfg, ob, tick, "player");
    for (let i = 0; i < 6; i++) {
      await runTick(a, cfg);
      await runTick(b, cfg);
    }
    expect(stateDigest(a)).not.toBe(stateDigest(b));
    const ca = a.companies.get(oa.companyId)!;
    const cb = b.companies.get(ob.companyId)!;
    expect(ca.capTable.some((x) => x.holderId === oa.fundId)).toBe(true);
    expect(cb.capTable.some((x) => x.holderId === ob.fundId)).toBe(false);
    const da = [...a.decisions.values()].find((d) => d.refId === oa.id)!;
    expect(da).toMatchObject({ by: "player", choice: "accept" });
    expect(a.ledger.check()).toEqual([]);
  }, 120_000);
});
