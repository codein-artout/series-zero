import { describe, expect, it } from "vitest";
import { gameConfig as cfg } from "@/config/game";
import {
  burnPerDay,
  demandShares,
  graceStep,
  hiringDelta,
  luckFactor,
  luckStep,
  marketingLevel,
  pivotDefault,
  pivotHeadcount,
  pivotScore,
  pivotThreshold,
  poolPerTick,
  priceTier,
  productScore,
  rawGrowth7d,
  revenueSplit,
  runwayDays,
  shouldProposePivot,
  smoothGrowth,
  teamQuality,
  zombieStep,
} from "@/lib/rules/company";
import { Rng } from "@/lib/rules/rng";
import { mean } from "@/lib/rules/math";
import { createWorld } from "@/lib/sim/genesis";
import { createCompany, createNpcFounder, createNpcFund, generateIdea } from "@/lib/sim/agents";
import { companyRunway, decidePivot, stepCompanyStates, stepPivots, stepRevenueAndBurn } from "@/lib/sim/company";
import { cash, companyAccount } from "@/lib/sim/world";

describe("costs and team", () => {
  it("daily burn = base ops + salaries + marketing (9 people, level 2 is about 26K)", () => {
    expect(burnPerDay(9, 2, cfg)).toBe(5000 + 9 * 1200 + 10000);
    expect(burnPerDay(0, 0, cfg)).toBe(5000);
    expect(burnPerDay(1, 99, cfg)).toBe(5000 + 1200 + 25000);
  });
  it("team quality grows with headcount and is clamped", () => {
    expect(teamQuality(0.8, 0, cfg)).toBeCloseTo(0.48);
    expect(teamQuality(0.8, 10, cfg)).toBeCloseTo(0.8 * (0.6 + 0.4 * (1 - Math.exp(-1))));
    expect(teamQuality(0.01, 1, cfg)).toBe(0.1);
    expect(teamQuality(5, 100, cfg)).toBe(1);
  });
});

describe("product score and luck", () => {
  it("s multiplies q, execution, team^0.6, marketing^0.5, luck", () => {
    const s = productScore({ q: 0.5, execution: 0.6, team: 0.7, marketingLevel: 2, luck: 1 }, cfg);
    expect(s).toBeCloseTo(0.5 * 0.6 * Math.pow(0.7, 0.6) * Math.pow(1.7, 0.5));
  });
  it("luck is autocorrelated with rho 0.7 and stationary variance 1", () => {
    const r = Rng.fromString("luck");
    let z = 0;
    const zs: number[] = [];
    for (let i = 0; i < 20000; i++) {
      z = luckStep(z, r.normal(), cfg);
      zs.push(z);
    }
    const m = mean(zs);
    const v = mean(zs.map((x) => (x - m) ** 2));
    const cov = mean(zs.slice(1).map((x, i) => (x - m) * (zs[i] - m)));
    expect(v).toBeGreaterThan(0.9);
    expect(v).toBeLessThan(1.1);
    expect(cov / v).toBeGreaterThan(0.65);
    expect(cov / v).toBeLessThan(0.75);
    expect(luckFactor(0, cfg)).toBe(1);
  });
});

describe("demand split", () => {
  const items = [
    { s: 0.5, tier: "standard" as const, traction: 1 },
    { s: 0.3, tier: "discount" as const, traction: 1 },
    { s: 0.4, tier: "premium" as const, traction: 0.5 },
  ];
  it("shares sum to 1", () => {
    const sh = demandShares(items, cfg);
    expect(sh.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(demandShares([{ s: 0, tier: "standard", traction: 1 }], cfg)).toEqual([0]);
  });
  it("concentration makes the better product take a more than proportional share", () => {
    const sh = demandShares([{ s: 0.6, tier: "standard", traction: 1 }, { s: 0.3, tier: "standard", traction: 1 }], cfg);
    expect(sh[0] / sh[1]).toBeCloseTo(Math.pow(2, 1.3));
  });
  it("price tiers trade units for price", () => {
    const pool = 1000;
    const disc = revenueSplit(pool, [{ s: 0.5, tier: "discount", traction: 1 }, { s: 0.5, tier: "standard", traction: 1 }], cfg);
    expect(disc[0] / disc[1]).toBeCloseTo((1.25 * 0.8) / 1);
    const prem = revenueSplit(pool, [{ s: 0.5, tier: "premium", traction: 1 }, { s: 0.5, tier: "standard", traction: 1 }], cfg);
    expect(prem[0] / prem[1]).toBeCloseTo((0.75 * 1.25) / 1);
  });
  it("pool per tick = annual / 365 / perDay x penetration x stabilizer", () => {
    expect(poolPerTick(365 * 3 * 100, 1, cfg)).toBeCloseTo(80);
    expect(poolPerTick(365 * 3 * 100, 0.5, cfg)).toBeCloseTo(40);
  });
});

describe("runway and growth", () => {
  it("runway = cash / net burn; ramen profitable is infinite", () => {
    expect(runwayDays(410_000, 26_000, 16_000)).toBeCloseTo(41);
    expect(runwayDays(100, 10, 10)).toBe(Number.POSITIVE_INFINITY);
    expect(runwayDays(100, 10, 20)).toBe(Number.POSITIVE_INFINITY);
    expect(runwayDays(-5, 10, 0)).toBe(0);
  });
  it("growth7d compares the last 21 ticks to the previous 21 and smooths with EMA", () => {
    const h = [...new Array(21).fill(100), ...new Array(21).fill(110)];
    expect(rawGrowth7d(h, cfg)).toBeCloseTo(0.1);
    expect(smoothGrowth(0, 0.1, cfg)).toBeCloseTo(0.03);
    expect(rawGrowth7d([0, 0, 0], cfg)).toBe(0);
  });
});

describe("grace, death and zombies", () => {
  it("debt starts a grace window, recovery ends it, running out kills", () => {
    let g = graceStep(100, -1, cfg);
    expect(g).toEqual({ graceLeft: cfg.company.graceTicks, dead: false });
    expect(graceStep(0, 3, cfg)).toEqual({ graceLeft: -1, dead: false });
    for (let i = 0; i < cfg.company.graceTicks - 1; i++) g = graceStep(100, g.graceLeft, cfg);
    expect(g.dead).toBe(false);
    g = graceStep(100, g.graceLeft, cfg);
    expect(g.dead).toBe(true);
  });
  it("zombie after windowTicks flat with cash; revives after recoverTicks above band", () => {
    let z = { zombieTicks: 0, recoverTicks: 0, isZombie: false };
    for (let i = 0; i < cfg.zombie.windowTicks; i++) z = zombieStep({ growth: 0.01, cash: 1, ...z }, cfg);
    expect(z.isZombie).toBe(true);
    expect(zombieStep({ growth: 0.01, cash: 0, zombieTicks: 10, recoverTicks: 0, isZombie: false }, cfg).zombieTicks).toBe(0);
    for (let i = 0; i < cfg.zombie.recoverTicks; i++) z = zombieStep({ growth: 0.05, cash: 1, ...z }, cfg);
    expect(z.isZombie).toBe(false);
  });
});

describe("policy", () => {
  it("hiring", () => {
    expect(hiringDelta({ runway: 100, growth: 0.06, risk: 0.5, ambition: "lifestyle" }, cfg)).toBe(1);
    expect(hiringDelta({ runway: 100, growth: 0.06, risk: 0.8, ambition: "lifestyle" }, cfg)).toBe(2);
    expect(hiringDelta({ runway: 100, growth: 0.06, risk: 0.8, ambition: "moonshot" }, cfg)).toBe(3);
    expect(hiringDelta({ runway: 100, growth: 0.04, risk: 0.8, ambition: "moonshot" }, cfg)).toBe(0);
    expect(hiringDelta({ runway: 29, growth: 1, risk: 1, ambition: "moonshot" }, cfg)).toBe(-1);
  });
  it("marketing level and price tier", () => {
    expect(marketingLevel(0.9, 100, cfg)).toBe(3);
    expect(marketingLevel(0.9, 44, cfg)).toBe(1);
    expect(marketingLevel(0.1, 44, cfg)).toBe(0);
    expect(priceTier({ riskAppetite: 0.5, ethics: 0.8, patience: 0.5, ambition: 0.5 }, "lifestyle", cfg)).toBe("discount");
    expect(priceTier({ riskAppetite: 0.8, ethics: 0.3, patience: 0.5, ambition: 0.5 }, "moonshot", cfg)).toBe("premium");
    expect(priceTier({ riskAppetite: 0.5, ethics: 0.5, patience: 0.5, ambition: 0.5 }, "moonshot", cfg)).toBe("standard");
  });
  it("pivot score, threshold by ambition, cooldown and default", () => {
    expect(pivotScore({ rejections: 3, sectorPercentile: 0, peers: 5, runway: 0 }, cfg)).toBeCloseTo(1);
    expect(pivotScore({ rejections: 0, sectorPercentile: 0, peers: 2, runway: 100 }, cfg)).toBe(0);
    expect(pivotScore({ rejections: 3, sectorPercentile: 1, peers: 5, runway: Number.POSITIVE_INFINITY }, cfg)).toBeCloseTo(0.4);
    expect(pivotThreshold("moonshot", 100, cfg)).toBeCloseTo(0.75);
    expect(pivotThreshold("moonshot", 20, cfg)).toBeCloseTo(0.6);
    expect(pivotThreshold("bootstrap", 100, cfg)).toBeCloseTo(0.5);
    expect(shouldProposePivot({ score: 0.7, ambition: "lifestyle", runway: 50, tick: 30, lastPivotTick: 20 }, cfg)).toBe(false);
    expect(shouldProposePivot({ score: 0.7, ambition: "lifestyle", runway: 50, tick: 50, lastPivotTick: 20 }, cfg)).toBe(true);
    expect(pivotDefault(19, cfg)).toBe("approve");
    expect(pivotDefault(21, cfg)).toBe("veto");
  });
  it("pivot cuts burn to about two thirds", () => {
    const before = burnPerDay(12, 2, cfg);
    const hc = pivotHeadcount(12, 2, cfg);
    expect(burnPerDay(hc.headcount, hc.marketing, cfg)).toBeLessThanOrEqual(before * cfg.pivot.burnMult);
  });
});

async function world(seed: string, ownerId: string | null = null) {
  const w = createWorld(seed, cfg);
  for (let i = 0; i < 4; i++) createNpcFund(w, cfg, 0);
  const cos = [];
  for (let i = 0; i < 6; i++) {
    const f = createNpcFounder(w, cfg, 0, { affinity: "climate", ownerId: i === 0 ? ownerId : null });
    const g = await generateIdea(w, cfg, f, 0, { stage: "seed", sectorHint: "climate", source: "seed" });
    cos.push(createCompany(w, cfg, f, g.idea, g.name, 0));
  }
  return { w, cos };
}

describe("company sim", () => {
  it("revenue is minted, burn is burned, the ledger balances, and companies with no cash die after grace", async () => {
    const { w, cos } = await world("company-sim");
    const victim = cos[1];
    w.ledger.burn(0, companyAccount(victim), cash(w, victim), "opex");
    victim.headcount = 30;
    let died = false;
    for (let t = 1; t <= 20 && !died; t++) {
      stepRevenueAndBurn(w, cfg, t, 1);
      w.ledger.assertInvariant(`tick ${t}`);
      const deaths = await stepCompanyStates(w, cfg, t);
      if (deaths.includes(victim)) died = true;
    }
    expect(victim.status).toBe("dead");
    expect(cos[0].revenueTotal).toBeGreaterThan(0);
    expect(cos[0].burnTotal).toBeGreaterThan(0);
  });

  it("runway is reported in days and falls as cash burns", async () => {
    const { w, cos } = await world("runway");
    const r0 = companyRunway(w, cfg, cos[0]);
    for (let t = 1; t <= 6; t++) stepRevenueAndBurn(w, cfg, t, 1);
    const r1 = companyRunway(w, cfg, cos[0]);
    expect(Number.isFinite(r0)).toBe(true);
    expect(r1).not.toBe(r0);
  });

  it("a player pivot becomes a decision; veto keeps the idea, approve changes it", async () => {
    const { w, cos } = await world("pivot", "user-1");
    const c = cos[0];
    c.rejections = 3;
    c.sectorPercentile = 0;
    c.sectorSize = 6;
    w.ledger.burn(0, companyAccount(c), cash(w, c) - 20_000, "opex");
    c.revenueHistory = [10, 10, 10];
    await stepPivots(w, cfg, 30);
    const d = [...w.decisions.values()].find((x) => x.kind === "pivot");
    expect(d).toBeDefined();
    const oldIdea = c.ideaId;
    expect(await decidePivot(w, cfg, d!.refId, "veto", "player", 31)).toBe("Vetoed.");
    expect(c.ideaId).toBe(oldIdea);
    expect(d!.by).toBe("player");
    // A second proposal after cooldown, approved this time.
    await stepPivots(w, cfg, 31 + cfg.pivot.cooldownTicks + 1);
    const d2 = [...w.decisions.values()].find((x) => x.kind === "pivot" && x.status === "open")!;
    const tractionBefore = c.traction;
    expect(await decidePivot(w, cfg, d2.refId, "approve", "player", 60)).toBe("Approved.");
    expect(c.ideaId).toBe(d2.refId);
    expect(c.pivotCount).toBe(1);
    expect(c.traction).toBeCloseTo(tractionBefore * cfg.pivot.tractionMult);
  });

  it("NPC pivots are auto-approved", async () => {
    const { w, cos } = await world("npc-pivot");
    const c = cos[2];
    c.rejections = 3;
    c.sectorPercentile = 0;
    c.sectorSize = 6;
    w.ledger.burn(0, companyAccount(c), cash(w, c) - 10_000, "opex");
    c.revenueHistory = [1, 1, 1];
    await stepPivots(w, cfg, 30);
    expect(c.pivotCount).toBe(1);
  });
});
