import { describe, expect, it } from "vitest";
import { gameConfig as cfg } from "@/config/game";
import { deployable, fundLeaderboard, hitRate, positionMultiple, proRataAmount, tvpi, vcTargets, type Position } from "@/lib/rules/fund";
import { createWorld } from "@/lib/sim/genesis";
import { createCompany, createNpcFounder, createNpcFund, generateIdea } from "@/lib/sim/agents";
import { acceptOffer, createOfferFromPitch } from "@/lib/sim/offers";
import { fundBoard, fundMetrics, stepMeetings, stepReputation, takeMeeting } from "@/lib/sim/funds";
import type { Pitch } from "@/lib/sim/types";

const pos = (cost: number, share: number, mark: number, proceeds = 0, status: Position["status"] = "live"): Position => ({ companyId: `c${cost}${share}`, cost, share, mark, proceeds, status });

describe("fund scoring", () => {
  it("TVPI = (distributions + live ownership x mark) / paid-in", () => {
    const p = [pos(1e6, 0.1, 30e6), pos(1e6, 0.2, 0, 0, "written_off")];
    expect(tvpi(5e6, p, 2e6)).toBeCloseTo((5e6 + 3e6) / 2e6);
    expect(tvpi(0, p, 0)).toBe(0);
  });
  it("hit rate counts positions at or above 1x", () => {
    const p = [pos(1e6, 0.1, 10e6), pos(1e6, 0.1, 9.9e6), pos(1e6, 0, 0, 3e6, "exited"), pos(1e6, 0.1, 0, 0, "written_off")];
    expect(positionMultiple(p[0])).toBeCloseTo(1);
    expect(hitRate(p, cfg)).toEqual({ hits: 2, total: 4, rate: 0.5 });
  });
  it("leaderboard by TVPI, tie-break hit rate, minimum 3 checks", () => {
    const rows = [
      { id: "a", tvpi: 2, hitRate: 0.1, investments: 10 },
      { id: "b", tvpi: 2, hitRate: 0.5, investments: 10 },
      { id: "c", tvpi: 9, hitRate: 1, investments: 2 },
      { id: "d", tvpi: 1, hitRate: 1, investments: 3 },
    ];
    expect(fundLeaderboard(rows, cfg).map((r) => r.id)).toEqual(["b", "a", "d"]);
  });
  it("one IPO and nine failures can top the board", () => {
    const conviction = [pos(1e6, 0.2, 400e6), ...Array.from({ length: 9 }, () => pos(1e6, 0.1, 0, 0, "written_off"))];
    const safe = Array.from({ length: 10 }, () => pos(1e6, 0.1, 12e6));
    const rows = [
      { id: "conviction", tvpi: tvpi(0, conviction, 10e6), hitRate: hitRate(conviction, cfg).rate, investments: 10 },
      { id: "safe", tvpi: tvpi(0, safe, 10e6), hitRate: hitRate(safe, cfg).rate, investments: 10 },
    ];
    expect(fundLeaderboard(rows, cfg)[0].id).toBe("conviction");
  });
  it("reputation targets, pro-rata and reserves", () => {
    const t = vcTargets([{ id: "a", tvpi: 3, hitRate: 1, investments: 3 }, { id: "b", tvpi: 1, hitRate: 0, investments: 3 }]);
    expect(t.get("a")).toBe(100);
    expect(t.get("b")).toBe(0);
    expect(proRataAmount(0.13, 3_000_000, 50_000)).toBe(400_000);
    expect(deployable(20e6, 60e6, cfg)).toBe(11e6);
  });
});

describe("fund sim", () => {
  it("follow-ons keep ownership and mark-ups drift the thesis toward the sector", async () => {
    const w = createWorld("followon", cfg);
    const a = createNpcFund(w, cfg, 0, { archetype: "thesisDriven" });
    const b = createNpcFund(w, cfg, 0, { archetype: "hypeChaser" });
    const f = createNpcFounder(w, cfg, 0);
    const g = await generateIdea(w, cfg, f, 0, { stage: "seed", source: "seed" });
    const c = createCompany(w, cfg, f, g.idea, g.name, 0);
    c.sectorPercentile = 0.9;
    const reaction = { interestRaw: 0.9, interest: 0.9, fit: 0.9, p: 0.8, roll: 0.1, offer: true, text: "yes", redFlags: [] };
    const o1 = await createOfferFromPitch(w, cfg, c, a, { id: "p1", ask: 1e6 } as Pitch, { fundId: a.id, ...reaction }, 1);
    await acceptOffer(w, cfg, o1, 1, "npc");
    const before = a.sectorWeights[c.sector];
    const o2 = await createOfferFromPitch(w, cfg, c, b, { id: "p2", ask: 3e6 } as Pitch, { fundId: b.id, ...reaction }, 30);
    o2.preMoney = o1.postMoney * 3;
    o2.postMoney = o2.preMoney + o2.check;
    await acceptOffer(w, cfg, o2, 30, "npc");
    expect([...w.deals.values()].some((d) => d.followOn && d.fundId === a.id)).toBe(true);
    expect(a.sectorWeights[c.sector]).toBeGreaterThan(before);
    expect(c.capTable.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
    expect(w.ledger.check()).toEqual([]);
    const m = fundMetrics(w, cfg, a);
    expect(m.total).toBe(1);
    expect(m.deployed).toBe(a.paidIn);
  });

  it("player funds get a take-1-of-3 meeting decision; the default is top by fit", async () => {
    const w = createWorld("meetings", cfg);
    const mine = createNpcFund(w, cfg, 0, { ownerId: "u1" });
    for (let i = 0; i < 4; i++) {
      const f = createNpcFounder(w, cfg, 0);
      const g = await generateIdea(w, cfg, f, 0, { stage: "seed", source: "seed" });
      createCompany(w, cfg, f, g.idea, g.name, 0);
    }
    stepMeetings(w, cfg, 1);
    const d = [...w.decisions.values()].find((x) => x.kind === "meeting")!;
    expect(d).toBeDefined();
    expect(mine.pendingMeetings).toHaveLength(3);
    const top = mine.pendingMeetings[0];
    const pitchId = await takeMeeting(w, cfg, d.refId, null, "default", 7);
    const p = w.appended.pitches.find((x) => x.id === pitchId)!;
    expect(p.companyId).toBe(top);
    expect(p.panel).toEqual([mine.id]);
    expect(d.by).toBe("default");
  });

  it("reputation updates daily and the board needs 3 checks", () => {
    const w = createWorld("rep", cfg);
    createNpcFund(w, cfg, 0);
    stepReputation(w, cfg, 3);
    expect(fundBoard(w, cfg)).toEqual([]);
  });
});
