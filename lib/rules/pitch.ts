/** Hybrid pitch scoring (GAME.md 6.4 and 7). Pure. The LLM never decides alone. */
import type { GameConfig, RedFlag, Stage } from "@/config/game";
import { STAGES } from "@/config/game";
import type { Rubric } from "@/lib/sim/types";
import { clamp, clamp01 } from "./math";

export const RUBRIC_KEYS = ["clarity", "market", "traction", "team", "defensibility"] as const;

export function clampRubric(r: Partial<Rubric>): Rubric {
  const out = {} as Rubric;
  for (const k of RUBRIC_KEYS) {
    const v = r[k];
    out[k] = clamp(typeof v === "number" && Number.isFinite(v) ? v : 0, 0, 10);
  }
  return out;
}

export const ZERO_RUBRIC: Rubric = { clarity: 0, market: 0, traction: 0, team: 0, defensibility: 0 };

/** Q = sum(weight[k] * rubric[k]) / 10 */
export function rubricQ(r: Rubric, cfg: GameConfig): number {
  const w = cfg.pitch.rubricWeights;
  const c = clampRubric(r);
  return RUBRIC_KEYS.reduce((a, k) => a + w[k] * c[k], 0) / 10;
}

/** Q' = clamp(Q + (charisma - 0.5) * charismaEffect + (R - 50)/50 * founderRepEffect, 0, 1) */
export function adjustedQ(Q: number, charisma: number, founderRep: number, cfg: GameConfig): number {
  return clamp01(Q + (charisma - 0.5) * cfg.pitch.charismaEffect + ((founderRep - 50) / 50) * cfg.pitch.founderRepEffect);
}

export function pivotPenalty(pivotCount: number, cfg: GameConfig): number {
  return Math.max(0, pivotCount - 1) * cfg.pivot.interestPenalty;
}

/**
 * interest = clamp01(clamp(judge, Q' - band, Q' + band) + archetype.interestBias - pivotPenalty - cooling)
 * The judge can move interest only inside the band around Q'.
 */
export function boundedInterest(judgeInterest: number, Qp: number, p: { bias: number; pivotPenalty: number; cooling?: number }, cfg: GameConfig): number {
  const band = cfg.pitch.interestBand;
  const j = Number.isFinite(judgeInterest) ? judgeInterest : Qp;
  return clamp01(clamp(j, Qp - band, Qp + band) + p.bias - p.pivotPenalty - (p.cooling ?? 0));
}

export function stageMatch(stage: Stage, fundStages: readonly Stage[], cfg: GameConfig): number {
  if (fundStages.includes(stage)) return 1;
  const i = STAGES.indexOf(stage);
  const adj = fundStages.some((s) => Math.abs(STAGES.indexOf(s) - i) === 1);
  return adj ? cfg.vc.stageAdjacent : 0;
}

export function checkMatch(ask: number, min: number, max: number, cfg: GameConfig): number {
  if (ask >= min && ask <= max) return 1;
  const ratio = ask < min ? (min - ask) / min : (ask - max) / max;
  return Math.max(0, 1 - cfg.vc.checkDistanceSlope * ratio);
}

export function redFlagPenalty(flags: readonly RedFlag[], cfg: GameConfig): number {
  return Math.min(1, cfg.vc.redFlagPenaltyPer * new Set(flags).size);
}

/** fit = 0.50 sectorMatch' + 0.20 stageMatch + 0.15 checkMatch + 0.15 (1 - redFlagPenalty) */
export function thesisFit(p: { sectorMatch: number; sectorFitMult: number; stageMatch: number; checkMatch: number; redFlagPenalty: number }, cfg: GameConfig): number {
  const w = cfg.vc.fitWeights;
  const sm = clamp01(p.sectorMatch * p.sectorFitMult);
  return clamp01(w.sector * sm + w.stage * p.stageMatch + w.check * p.checkMatch + w.redFlags * (1 - p.redFlagPenalty));
}

export function pOffer(interest: number, fit: number): number {
  return clamp01(interest) * clamp01(fit);
}

/** Offer if r <= P(offer). */
export function isOffer(roll: number, p: number): boolean {
  return roll <= p;
}

/** Panel routing weight: fit * exp(R_vc / repScale). */
export function routingWeight(fit: number, vcRep: number, cfg: GameConfig): number {
  return Math.max(0, fit) * Math.exp(vcRep / cfg.vc.repScale);
}

export function fraudFine(offence: number, cfg: GameConfig): { fine: number; banTicks: number; suspend: boolean } {
  if (offence <= 1) return { fine: cfg.fraud.fineFirst, banTicks: 0, suspend: false };
  if (offence === 2) return { fine: cfg.fraud.fineSecond, banTicks: cfg.fraud.pitchBanTicks, suspend: false };
  return { fine: cfg.fraud.fineSecond, banTicks: cfg.fraud.pitchBanTicks, suspend: true };
}
