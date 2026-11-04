/** Term sheets, dilution and negotiation (GAME.md section 10). Pure. */
import type { GameConfig, Stage } from "@/config/game";
import type { CapEntry } from "@/lib/sim/types";
import { clamp, clamp01, median } from "./math";

export function round50k(x: number, cfg: GameConfig): number {
  return Math.round(x / cfg.terms.checkRound) * cfg.terms.checkRound;
}

export function sectorMult(sectorPool: number, allPools: number[], cfg: GameConfig): number {
  const m = median(allPools);
  return clamp(m > 0 ? sectorPool / m : 1, cfg.terms.sectorMultMin, cfg.terms.sectorMultMax);
}

export function hypeFactor(H: number, cfg: GameConfig): number {
  return 1 + cfg.terms.hypeFactorSlope * (H - 50);
}

export function offerCheck(ask: number, interest: number, checkMin: number, checkMax: number, cfg: GameConfig): number {
  return clamp(round50k(ask * (cfg.terms.checkBase + cfg.terms.checkInterest * interest), cfg), checkMin, checkMax);
}

export function offerPreMoney(stage: Stage, sMult: number, H: number, interest: number, cfg: GameConfig): number {
  const pre = cfg.terms.stageBasePre[stage] * sMult * hypeFactor(H, cfg) * (cfg.terms.preBase + cfg.terms.preInterest * interest);
  return Math.round(pre / 10_000) * 10_000;
}

export interface TermSheet {
  check: number;
  preMoney: number;
  postMoney: number;
  ownership: number;
  board: "observer" | "seat";
  proRata: boolean;
  liqPref: string;
  optionPool: number;
}

export function buildTerms(p: { ask: number; interest: number; stage: Stage; sMult: number; H: number; checkMin: number; checkMax: number }, cfg: GameConfig): TermSheet {
  const check = offerCheck(p.ask, p.interest, p.checkMin, p.checkMax, cfg);
  const preMoney = offerPreMoney(p.stage, p.sMult, p.H, p.interest, cfg);
  return finishTerms(check, preMoney, p.interest, cfg);
}

export function finishTerms(check: number, preMoney: number, interest: number, cfg: GameConfig): TermSheet {
  const postMoney = preMoney + check;
  return {
    check,
    preMoney,
    postMoney,
    ownership: check / postMoney,
    board: check >= cfg.terms.boardSeatCheck ? "seat" : "observer",
    proRata: interest >= cfg.terms.proRataInterest,
    liqPref: cfg.terms.liquidationPreference,
    optionPool: cfg.terms.optionPool,
  };
}

/** Existing holders dilute by pre/post; the investor gets check/post. Shares always sum to 1. */
export function dilute(cap: CapEntry[], check: number, preMoney: number, investor: { id: string; name: string }): CapEntry[] {
  const post = preMoney + check;
  const k = preMoney / post;
  const next = cap.map((c) => ({ ...c, share: c.share * k }));
  const own = check / post;
  const existing = next.find((c) => c.holderType === "fund" && c.holderId === investor.id);
  if (existing) existing.share += own;
  else next.push({ holderType: "fund", holderId: investor.id, name: investor.name, share: own });
  return next;
}

/** A = clamp(1 - 1.6 max(0, rhoPre - 1) - 0.8 max(0, rhoCheck - 1), 0, 1) * (0.5 + 0.5 patience) */
export function counterAcceptance(p: { offerPre: number; offerCheck: number; counterPre: number; counterCheck: number; patience: number }, cfg: GameConfig): number {
  const rhoPre = p.counterPre / p.offerPre;
  const rhoCheck = p.counterCheck / p.offerCheck;
  const n = cfg.negotiation;
  return clamp01(1 - n.prePenalty * Math.max(0, rhoPre - 1) - n.checkPenalty * Math.max(0, rhoCheck - 1)) * (0.5 + 0.5 * clamp01(p.patience));
}

export type CounterOutcome = { accepted: true; patience: number } | { accepted: false; patience: number; pulled: boolean };

export function resolveCounter(A: number, roll: number, patience: number, cfg: GameConfig): CounterOutcome {
  if (roll <= A) return { accepted: true, patience };
  const next = patience - cfg.negotiation.patienceHit;
  return { accepted: false, patience: next, pulled: next < cfg.negotiation.pullBelow };
}

/** Each other live offer on the company lowers patience by competitionDecay per tick. */
export function competitionDecay(patience: number, otherLiveOffers: number, cfg: GameConfig): number {
  return patience - cfg.negotiation.competitionDecay * Math.max(0, otherLiveOffers);
}

export function startingPatience(archetypePatience: number, u: number, cfg: GameConfig): number {
  return clamp01(archetypePatience + (2 * u - 1) * cfg.negotiation.patienceJitter);
}

/** NPC founders rank offers by price (pre-money), then check; bootstrap founders avoid board seats. */
export function rankOffers<T extends { preMoney: number; check: number; board: "observer" | "seat" }>(offers: T[], avoidBoard: boolean): T[] {
  return [...offers].sort((a, b) => {
    if (avoidBoard && a.board !== b.board) return a.board === "seat" ? 1 : -1;
    return b.preMoney - a.preMoney || b.check - a.check;
  });
}
