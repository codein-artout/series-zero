import { describe, expect, it } from "vitest";
import { gameConfig as cfg } from "@/config/game";
import {
  buildTerms,
  competitionDecay,
  counterAcceptance,
  dilute,
  hypeFactor,
  offerCheck,
  offerPreMoney,
  rankOffers,
  resolveCounter,
  sectorMult,
  startingPatience,
} from "@/lib/rules/terms";
import { createWorld } from "@/lib/sim/genesis";
import { createCompany, createNpcFounder, createNpcFund, generateIdea } from "@/lib/sim/agents";
import { acceptOffer, counterOffer, createOfferFromPitch, declineOffer, stepOffers } from "@/lib/sim/offers";
import { resolvePitch } from "@/lib/sim/pitch";
import { companyAccount, fundAccount } from "@/lib/sim/world";
import type { Pitch } from "@/lib/sim/types";

describe("term sheet pricing", () => {
  it("check = round50K(ask x (0.8 + 0.2 interest)) clamped to the fund's range", () => {
    expect(offerCheck(1_200_000, 1, 500_000, 3_000_000, cfg)).toBe(1_200_000);
    expect(offerCheck(1_200_000, 0, 500_000, 3_000_000, cfg)).toBe(950_000);
    expect(offerCheck(100_000, 0.5, 500_000, 3_000_000, cfg)).toBe(500_000);
    expect(offerCheck(9_000_000, 0.5, 500_000, 3_000_000, cfg)).toBe(3_000_000);
  });
  it("pre-money = stage base x sector mult x hype factor x (0.75 + 0.5 interest)", () => {
    expect(hypeFactor(50, cfg)).toBe(1);
    expect(hypeFactor(72, cfg)).toBeCloseTo(1.088);
    expect(sectorMult(62.4, [62.4, 48.2, 31, 27.8, 19.5, 14.6, 12.1], cfg)).toBe(1.6);
    expect(sectorMult(31, [62.4, 48.2, 31, 27.8, 19.5, 14.6, 12.1], cfg)).toBeCloseTo(31 / 27.8);
    expect(sectorMult(1000, [1, 1, 1000], cfg)).toBe(1.6);
    expect(sectorMult(0.1, [1, 1, 1], cfg)).toBe(0.6);
    expect(offerPreMoney("seed", 1, 50, 0.5, cfg)).toBe(8_000_000);
    expect(offerPreMoney("preseed", 1, 50, 1, cfg)).toBe(3_750_000);
  });
  it("post, ownership, board, pro-rata", () => {
    const t = buildTerms({ ask: 1_200_000, interest: 1, stage: "seed", sMult: 1, H: 50, checkMin: 500_000, checkMax: 3_000_000 }, cfg);
    expect(t.postMoney).toBe(t.preMoney + t.check);
    expect(t.ownership).toBeCloseTo(t.check / t.postMoney);
    expect(t.board).toBe("observer");
    expect(t.proRata).toBe(true);
    const big = buildTerms({ ask: 6_000_000, interest: 0.5, stage: "seriesA", sMult: 1, H: 50, checkMin: 500_000, checkMax: 3_000_000 }, cfg);
    expect(big.board).toBe("seat");
    expect(buildTerms({ ask: 1_000_000, interest: 0.59, stage: "seed", sMult: 1, H: 50, checkMin: 0, checkMax: 9e9 }, cfg).proRata).toBe(false);
  });
  it("dilution keeps shares summing to 1 and existing holders dilute by pre/post", () => {
    const cap = [
      { holderType: "founder" as const, holderId: "f", name: "F", share: 0.8 },
      { holderType: "angels" as const, holderId: null, name: "A", share: 0.1 },
      { holderType: "pool" as const, holderId: null, name: "P", share: 0.1 },
    ];
    const next = dilute(cap, 1_200_000, 8_000_000, { id: "v", name: "V" });
    expect(next.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 12);
    expect(next[0].share).toBeCloseTo(0.8 * (8 / 9.2));
    expect(next[3].share).toBeCloseTo(1.2 / 9.2);
    const again = dilute(next, 1_000_000, 20_000_000, { id: "v", name: "V" });
    expect(again).toHaveLength(4);
    expect(again.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 12);
  });
});

describe("negotiation", () => {
  it("acceptance A falls with greed and rises with patience", () => {
    const base = { offerPre: 8e6, offerCheck: 1.2e6, counterPre: 8e6, counterCheck: 1.2e6, patience: 1 };
    expect(counterAcceptance(base, cfg)).toBe(1);
    expect(counterAcceptance({ ...base, patience: 0 }, cfg)).toBe(0.5);
    expect(counterAcceptance({ ...base, counterPre: 10e6 }, cfg)).toBeCloseTo(1 - 1.6 * 0.25);
    expect(counterAcceptance({ ...base, counterCheck: 1.5e6 }, cfg)).toBeCloseTo(1 - 0.8 * 0.25);
    expect(counterAcceptance({ ...base, counterPre: 10e6, counterCheck: 1.5e6, patience: 0.64 }, cfg)).toBeCloseTo((1 - 0.4 - 0.2) * 0.82);
    expect(counterAcceptance({ ...base, counterPre: 20e6 }, cfg)).toBe(0);
    expect(counterAcceptance({ ...base, counterPre: 6e6 }, cfg)).toBe(1);
  });
  it("counter roll boundary, patience hit and pull", () => {
    expect(resolveCounter(0.5, 0.5, 0.6, cfg)).toEqual({ accepted: true, patience: 0.6 });
    const miss = resolveCounter(0.5, 0.51, 0.6, cfg);
    expect(miss).toEqual({ accepted: false, patience: 0.6 - 0.2, pulled: false });
    const pull = resolveCounter(0.1, 0.9, 0.35, cfg);
    expect(pull.accepted).toBe(false);
    expect(pull.patience).toBeCloseTo(0.15);
    if (!pull.accepted) expect(pull.pulled).toBe(true);
  });
  it("competition decay and starting patience", () => {
    expect(competitionDecay(0.6, 2, cfg)).toBeCloseTo(0.5);
    expect(competitionDecay(0.6, 0, cfg)).toBe(0.6);
    expect(startingPatience(0.45, 0, cfg)).toBeCloseTo(0.35);
    expect(startingPatience(0.45, 1, cfg)).toBeCloseTo(0.55);
  });
  it("NPC ranking prefers price, bootstrap avoids board seats", () => {
    const a = { preMoney: 9e6, check: 3e6, board: "seat" as const };
    const b = { preMoney: 8e6, check: 1e6, board: "observer" as const };
    expect(rankOffers([b, a], false)[0]).toBe(a);
    expect(rankOffers([a, b], true)[0]).toBe(b);
  });
});

async function withOffer(seed: string) {
  const w = createWorld(seed, cfg);
  const fund = createNpcFund(w, cfg, 0, { archetype: "hypeChaser" });
  const rival = createNpcFund(w, cfg, 0, { archetype: "skeptic" });
  const founder = createNpcFounder(w, cfg, 0, { ownerId: "user1", ambition: "moonshot" });
  const g = await generateIdea(w, cfg, founder, 0, { stage: "seed", source: "seed" });
  const c = createCompany(w, cfg, founder, g.idea, g.name, 0);
  const pitch = { id: "pitch_x", ask: 1_200_000 } as Pitch;
  const o = await createOfferFromPitch(w, cfg, c, fund, pitch, { fundId: fund.id, interestRaw: 0.8, interest: 0.8, fit: 0.7, p: 0.56, roll: 0.1, offer: true, text: "We move fast.", redFlags: [] }, 1);
  const o2 = await createOfferFromPitch(w, cfg, c, rival, pitch, { fundId: rival.id, interestRaw: 0.5, interest: 0.5, fit: 0.5, p: 0.25, roll: 0.1, offer: true, text: "Fine.", redFlags: [] }, 1);
  return { w, fund, rival, founder, c, o, o2 };
}

describe("offers in the sim", () => {
  it("accepting moves scrip fund -> company, burns the close fee, dilutes, supersedes rivals", async () => {
    const { w, fund, c, o, o2 } = await withOffer("accept");
    const fundBefore = w.ledger.balance(fundAccount(fund));
    const coBefore = w.ledger.balance(companyAccount(c));
    const res = await acceptOffer(w, cfg, o, 2, "player");
    expect(res.ok).toBe(true);
    expect(w.ledger.balance(fundAccount(fund))).toBe(fundBefore - o.check);
    expect(w.ledger.balance(companyAccount(c))).toBe(coBefore + o.check - Math.round(o.check * cfg.fees.closeRate));
    expect(c.capTable.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 12);
    expect(c.capTable.find((x) => x.holderId === fund.id)?.share).toBeCloseTo(o.ownership);
    expect(o2.status).toBe("superseded");
    expect(c.stage).toBe("seriesA");
    expect(c.leadFundId).toBe(fund.id);
    expect(w.appended.cards.some((x) => x.kind === "term_sheet")).toBe(true);
    expect([...w.decisions.values()].filter((d) => d.status === "open")).toHaveLength(0);
    expect(w.ledger.check()).toEqual([]);
    expect((await acceptOffer(w, cfg, o, 3, "player")).ok).toBe(false);
  });

  it("counters: at most maxCounters, deterministic rolls, accepted counters reprice", async () => {
    const a = await withOffer("counter");
    const b = await withOffer("counter");
    const ra = await counterOffer(a.w, cfg, a.o, a.o.check, a.o.preMoney + 100_000, 2, "player");
    const rb = await counterOffer(b.w, cfg, b.o, b.o.check, b.o.preMoney + 100_000, 2, "player");
    expect(ra).toEqual(rb);
    if (ra.ok && ra.accepted) expect(a.o.preMoney).toBe(a.o.counters[0].preMoney);
    await counterOffer(a.w, cfg, a.o, a.o.check, a.o.preMoney, 2, "player");
    const third = await counterOffer(a.w, cfg, a.o, a.o.check, a.o.preMoney, 2, "player");
    expect(third.ok).toBe(false);
  });

  it("offers lapse after lifetime; the default for a player is decline", async () => {
    const { w, o, o2 } = await withOffer("lapse");
    for (let t = 2; t <= 1 + cfg.offer.lifetimeTicks; t++) await stepOffers(w, cfg, t);
    expect(["lapsed", "pulled"]).toContain(o.status);
    expect(["lapsed", "pulled"]).toContain(o2.status);
    const decs = [...w.decisions.values()];
    expect(decs.every((d) => d.status !== "open" && d.by === "default")).toBe(true);
  });

  it("decline is recorded as the player's choice", async () => {
    const { w, o } = await withOffer("decline");
    declineOffer(w, cfg, o, 2, "player");
    expect(o.status).toBe("declined");
    const d = [...w.decisions.values()].find((x) => x.refId === o.id)!;
    expect(d).toMatchObject({ by: "player", choice: "decline", status: "resolved" });
  });

  it("NPC founders take the best offer after a tick", async () => {
    const w = createWorld("npc-take", cfg);
    for (let i = 0; i < 8; i++) createNpcFund(w, cfg, 0, { archetype: "hypeChaser" });
    const f = createNpcFounder(w, cfg, 0, { ambition: "lifestyle" });
    const g = await generateIdea(w, cfg, f, 0, { stage: "seed", source: "seed" });
    const c = createCompany(w, cfg, f, g.idea, g.name, 0);
    let got = false;
    for (let t = 1; t < 200 && !got; t += 31) {
      const p = await resolvePitch(w, cfg, c, t, { source: "npc" });
      if (p.offerIds.length) {
        await stepOffers(w, cfg, t + 1);
        got = true;
        expect(c.rounds).toBe(1);
      }
    }
    expect(got).toBe(true);
    expect(w.ledger.check()).toEqual([]);
  });
});
