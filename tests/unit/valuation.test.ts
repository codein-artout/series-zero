import { describe, expect, it } from "vitest";
import { gameConfig as cfg } from "@/config/game";
import { acceptsExit, assignOutcomes, bidFromPremium, bidProbability, compositeScores, exitEligible, exitSplit, sectorValue, sliceTargets, smoothMark } from "@/lib/rules/valuation";
import { forwardOdds } from "@/lib/rules/odds";
import { Rng } from "@/lib/rules/rng";
import { createWorld } from "@/lib/sim/genesis";
import { createAcquirer, createCompany, createNpcFounder, createNpcFund, generateIdea } from "@/lib/sim/agents";
import { acceptOffer, createOfferFromPitch } from "@/lib/sim/offers";
import { acceptExit, stepValuation } from "@/lib/sim/valuation";
import type { ExitOffer, Pitch } from "@/lib/sim/types";
import { stepRevenueAndBurn } from "@/lib/sim/company";

const mk = (id: string, growth: number, rev: number, eff: number) => ({ id, growth, revenueAnnual: rev, efficiency: eff });

describe("composite score", () => {
  it("percentiles with ties averaged, weights 50/30/20", () => {
    const s = compositeScores([mk("a", 0.1, 100, 1), mk("b", 0.2, 200, 2), mk("c", 0.3, 300, 3), mk("d", 0.3, 400, 4), mk("e", 0.5, 500, 5)], cfg);
    expect(s[2].pct.growth).toBeCloseTo(s[3].pct.growth);
    expect(s[4].S).toBeCloseTo(1);
    expect(s[0].S).toBeLessThanOrEqual(0.5);
  });
  it("below-median growth caps S at 0.5 even with top scale and efficiency", () => {
    const s = compositeScores([mk("a", 0.0, 9999, 9), mk("b", 0.1, 1, 0), mk("c", 0.2, 1, 0), mk("d", 0.3, 1, 0), mk("e", 0.4, 1, 0)], cfg);
    expect(s[0].belowMedian).toBe(true);
    expect(s[0].S).toBeLessThanOrEqual(cfg.valuation.belowMedianCap);
  });
  it("small sectors use bands 0.8 / 0.5 / 0.2 (then the median cap)", () => {
    const s = compositeScores([mk("a", 0.3, 300, 3), mk("b", 0.2, 200, 2), mk("c", 0.1, 100, 1)], cfg);
    expect(s.map((x) => x.S)).toEqual([0.8, 0.5, 0.2]);
    const four = compositeScores([mk("a", 0.4, 1, 1), mk("b", 0.3, 1, 1), mk("c", 0.2, 1, 1), mk("d", 0.1, 1, 1)], cfg);
    expect(four[0].S).toBe(0.8);
    expect(four[3].S).toBe(0.2);
  });
  it("ranking is monotone: more growth never lowers the composite", () => {
    const r = Rng.fromString("mono");
    for (let trial = 0; trial < 200; trial++) {
      const items = Array.from({ length: 8 }, (_, i) => mk(`c${i}`, r.uniform(-0.2, 0.4), r.uniform(0, 1e6), r.uniform(0, 2)));
      const before = compositeScores(items, cfg);
      const boosted = items.map((x, i) => (i === 0 ? { ...x, growth: x.growth + 0.5 } : x));
      const after = compositeScores(boosted, cfg);
      expect(after[0].S).toBeGreaterThanOrEqual(before[0].S - 1e-12);
    }
  });
});

describe("slice targets", () => {
  it("steep slice sums to the sector value when no floor binds", () => {
    const items = [{ id: "a", S: 0.9, revenueAnnual: 0 }, { id: "b", S: 0.5, revenueAnnual: 0 }, { id: "c", S: 0.2, revenueAnnual: 0 }];
    const t = sliceTargets(items, 1000, cfg);
    expect([...t.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1000);
    expect(t.get("a")! / t.get("b")!).toBeCloseTo(Math.pow(0.9 / 0.5, 3));
  });
  it("revenue floor is applied first; the rest share the remainder", () => {
    const items = [{ id: "a", S: 0.9, revenueAnnual: 0 }, { id: "b", S: 0.1, revenueAnnual: 300 }];
    const t = sliceTargets(items, 1000, cfg);
    expect(t.get("b")).toBe(300);
    expect(t.get("a")).toBeCloseTo(700);
  });
  it("sector value scales with hype and smoothing moves 35% of the gap", () => {
    expect(sectorValue(100, 50, cfg)).toBe(100);
    expect(sectorValue(100, 100, cfg)).toBeCloseTo(120);
    expect(smoothMark(100, 200, cfg)).toBeCloseTo(135);
  });
  it("ranking monotonicity carries through to targets", () => {
    const t = sliceTargets([{ id: "a", S: 0.8, revenueAnnual: 0 }, { id: "b", S: 0.6, revenueAnnual: 0 }, { id: "c", S: 0.4, revenueAnnual: 0 }], 1e6, cfg);
    expect(t.get("a")!).toBeGreaterThan(t.get("b")!);
    expect(t.get("b")!).toBeGreaterThan(t.get("c")!);
  });
});

describe("outcome ladder", () => {
  it("assigns in order dead, IPO, acquired, unicorn, zombie, operating with IPO slots", () => {
    const items = [
      { id: "dead", status: "dead" as const, mark: 99e6, exitedThisSeason: false },
      { id: "i1", status: "alive" as const, mark: 90e6, exitedThisSeason: false },
      { id: "i2", status: "alive" as const, mark: 80e6, exitedThisSeason: false },
      { id: "i3", status: "zombie" as const, mark: 70e6, exitedThisSeason: false },
      { id: "i4", status: "alive" as const, mark: 60e6, exitedThisSeason: false },
      { id: "acq", status: "acquired" as const, mark: 50e6, exitedThisSeason: true },
      { id: "uni", status: "alive" as const, mark: 20e6, exitedThisSeason: false },
      { id: "zom", status: "zombie" as const, mark: 1e6, exitedThisSeason: false },
      { id: "op", status: "alive" as const, mark: 19_999_999, exitedThisSeason: false },
    ];
    const r = assignOutcomes(items, cfg.outcome.ipoSlotsPerSeason, cfg);
    expect(r.get("dead")).toBe("dead");
    expect(["i1", "i2", "i3"].map((x) => r.get(x))).toEqual(["IPO", "IPO", "IPO"]);
    expect(r.get("i4")).toBe("unicorn");
    expect(r.get("acq")).toBe("acquired");
    expect(r.get("uni")).toBe("unicorn");
    expect(r.get("zom")).toBe("zombie");
    expect(r.get("op")).toBe("operating");
    expect(assignOutcomes(items, 1, cfg).get("i2")).toBe("unicorn");
  });
  it("forward odds sum to 1 and are deterministic", () => {
    const input = { companyId: "c", tick: 100, ticksLeft: 170, status: "alive" as const, cash: 500_000, burnPerTick: 6000, revenuePerTick: 4000, growth7d: 0.08, mark: 9e6, percentile: 0.8, ambition: "moonshot" as const, hype: 60, offerRate: 0.2, roundSize: 1e6 };
    const a = forwardOdds(input, cfg, "seed");
    const b = forwardOdds(input, cfg, "seed");
    expect(a).toEqual(b);
    expect(a.IPO + a.Unicorn + a.Acquired + a.Zombie + a.Dead).toBeCloseTo(1);
    expect(forwardOdds({ ...input, status: "dead" }, cfg, "seed").Dead).toBe(1);
  });
});

describe("exits", () => {
  it("eligibility, bid probability, premium cap and ambition thresholds", () => {
    expect(exitEligible({ ageDays: 14, percentile: 0.5, revenueAnnual: 1e6, status: "alive" }, cfg)).toBe(true);
    expect(exitEligible({ ageDays: 13.9, percentile: 0.5, revenueAnnual: 1e6, status: "alive" }, cfg)).toBe(false);
    expect(exitEligible({ ageDays: 20, percentile: 0.49, revenueAnnual: 1e6, status: "alive" }, cfg)).toBe(false);
    expect(bidProbability(1, 50, cfg)).toBeCloseTo(0.008);
    expect(bidProbability(0.5, 100, cfg)).toBeCloseTo(0.004 * 1.5 * 1.5);
    expect(bidFromPremium(1e6, 100, cfg).bid).toBe(16e6);
    expect(bidFromPremium(1e6, 2, cfg).bid).toBe(3e6);
    expect(acceptsExit(1.6e6, 1e6, "moonshot", cfg)).toBe(true);
    expect(acceptsExit(1.59e6, 1e6, "moonshot", cfg)).toBe(false);
    expect(acceptsExit(1.2e6, 1e6, "lifestyle", cfg)).toBe(true);
  });
  it("exit split: fee, fund shares of net, capped founder wallet", () => {
    const s = exitSplit(100_000_000, [{ holderType: "founder", holderId: "f", share: 0.7 }, { holderType: "fund", holderId: "v", share: 0.2 }, { holderType: "pool", holderId: null, share: 0.1 }], cfg);
    expect(s.fee).toBe(2_000_000);
    expect(s.funds[0].amount).toBe(Math.floor(0.2 * 98_000_000));
    expect(s.founderWallet).toBe(Math.min(250_000, Math.floor(0.002 * 0.7 * 98_000_000)));
  });
  it("accepting a bid moves scrip treasury -> funds, burns the fee, keeps the ledger balanced", async () => {
    const w = createWorld("exit-sim", cfg);
    const fund = createNpcFund(w, cfg, 0);
    const a = createAcquirer(w, cfg, 0);
    const f = createNpcFounder(w, cfg, 0, { ownerId: "u1" });
    const g = await generateIdea(w, cfg, f, 0, { stage: "seed", source: "seed" });
    const c = createCompany(w, cfg, f, g.idea, g.name, 0);
    const o = await createOfferFromPitch(w, cfg, c, fund, { id: "p", ask: 1e6 } as Pitch, { fundId: fund.id, interestRaw: 0.7, interest: 0.7, fit: 0.7, p: 0.5, roll: 0.1, offer: true, text: "ok", redFlags: [] }, 1);
    await acceptOffer(w, cfg, o, 1, "player");
    for (let t = 2; t < 6; t++) {
      stepRevenueAndBurn(w, cfg, t, 1);
      stepValuation(w, cfg, t);
    }
    expect(c.mark).toBeGreaterThan(0);
    const e: ExitOffer = { id: "exit_1", companyId: c.id, acquirerId: a.id, tick: 6, expiresTick: 12, bid: Math.round(c.mark * 3), mark: c.mark, premium: 2, status: "open", decidedBy: null };
    w.exitOffers.set(e.id, e);
    const res = await acceptExit(w, cfg, e, 6, "player");
    expect(res.ok).toBe(true);
    expect(c.status).toBe("acquired");
    expect(fund.distributions).toBeGreaterThan(0);
    expect([...w.deals.values()][0].status).toBe("exited");
    expect(w.appended.cards.some((x) => x.kind === "exit")).toBe(true);
    expect(w.ledger.check()).toEqual([]);
  });
});
