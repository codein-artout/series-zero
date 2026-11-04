/** World rules: sector pools, hype index, crash risk, news shocks (GAME.md section 4). Pure. */
import type { GameConfig, SectorId } from "@/config/game";
import { SECTOR_IDS } from "@/config/game";
import { clamp } from "./math";

export function hypeEffect(H: number, cfg: GameConfig): number {
  return cfg.world.hypeGain * ((H - 50) / 50);
}

/** P' = P * (1 + drift + hypeEffect + shock + volatility * z), clamped to [0.5, 2.0] * base. */
export function poolStep(P: number, base: number, p: { drift: number; volatility: number; H: number; shock: number; z: number }, cfg: GameConfig): number {
  const next = P * (1 + p.drift + hypeEffect(p.H, cfg) + p.shock + p.volatility * p.z);
  return clamp(next, cfg.sector.poolClampMin * base, cfg.sector.poolClampMax * base);
}

/** herdSpike = max(0, share of checks into top-2 sectors - 0.4). */
export function herdSpike(checksBySector: Partial<Record<SectorId, number>>, cfg: GameConfig): number {
  const vals = SECTOR_IDS.map((s) => checksBySector[s] ?? 0).sort((a, b) => b - a);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return Math.max(0, (vals[0] + vals[1]) / total - cfg.hype.herdShareThreshold);
}

export function newsImpact(events: Array<{ sentiment: number; magnitude: number }>): number {
  return clamp(
    events.reduce((a, e) => a + e.sentiment * e.magnitude, 0),
    -1,
    1,
  );
}

/** H' = clamp(H + k(50 - H) + newsGain*news + herdingGain*herd + N(0, noise)) */
export function hypeStep(H: number, news: number, herd: number, z: number, cfg: GameConfig): number {
  const c = cfg.hype;
  return clamp(H + c.meanReversion * (50 - H) + c.newsGain * news + c.herdingGain * herd + c.noise * z, 0, 100);
}

export type HypeBandName = "Frozen" | "Cool" | "Warm" | "Hot" | "Bubble";
export function hypeBand(H: number, cfg: GameConfig): HypeBandName {
  const [a, b, c, d] = cfg.hype.bands;
  if (H < a) return "Frozen";
  if (H < b) return "Cool";
  if (H < c) return "Warm";
  if (H < d) return "Hot";
  return "Bubble";
}

export function crashProbability(H: number, cfg: GameConfig): number {
  return clamp(cfg.hype.crashCoefficient * Math.max(0, H - cfg.hype.crashFloor), 0, 1);
}

export function crashRiskSeason(H: number, ticksRemaining: number, cfg: GameConfig): number {
  const p = crashProbability(H, cfg);
  return 1 - Math.pow(1 - p, Math.max(0, ticksRemaining));
}

/** Total pool shock of a news item, spread over events.spreadTicks ticks. */
export function newsShock(sentiment: number, magnitude: number, sensitivity: number, cfg: GameConfig): { total: number; perTick: number; ticks: number } {
  const total = clamp(sentiment, -1, 1) * clamp(magnitude, 0, 1) * cfg.events.maxShock * sensitivity;
  return { total, perTick: total / cfg.events.spreadTicks, ticks: cfg.events.spreadTicks };
}

const SECTOR_RULES: Array<[SectorId, RegExp]> = [
  ["ai_infra", /\b(model|models|gpu|chip|chips|inference|ai|compute|agent|datacent\w*)\b/i],
  ["climate", /\b(solar|battery|cell|grid|carbon|climate|heat|water|drought|wind|emission\w*|farm\w*)\b/i],
  ["fintech", /\b(bank\w*|stablecoin\w*|payment\w*|lend\w*|credit|insur\w*|rates?|fintech|card)\b/i],
  ["health", /\b(clinic\w*|drug\w*|trial\w*|health|patient\w*|hospital\w*|vaccine\w*|medical)\b/i],
  ["devtools", /\b(developer\w*|open source|api|cloud|devtools|code|deploy\w*|outage)\b/i],
  ["consumer", /\b(consumer\w*|shopper\w*|retail|app store|creator\w*|holiday|spending)\b/i],
  ["space", /\b(satellite\w*|launch\w*|orbit\w*|rocket\w*|space|lunar)\b/i],
];
const POS = /\b(hits|record|breakthrough|approv\w*|surge\w*|wins?|opens|cuts? cost|cheaper|doubles?|beats?|boom|funds?|grants?|expands?)\b/i;
const NEG = /\b(review|ban\w*|limits?|tighten\w*|probe|fine\w*|crash\w*|outage|recall\w*|delay\w*|halt\w*|lawsuit|slump\w*|shortage|fails?)\b/i;
const POLICY = /\b(regulat\w*|law|rule|rules|ban\w*|limits?|export|tariff\w*|review|policy|probe)\b/i;

/** Deterministic keyword classifier for headlines (an LLM may only refine inside these bounds). */
export function classifyHeadline(headline: string): { sector: SectorId; sentiment: number; kind: "breakthrough" | "regulation" | "market" } {
  let sector: SectorId = "consumer";
  for (const [s, re] of SECTOR_RULES) {
    if (re.test(headline)) {
      sector = s;
      break;
    }
  }
  const pos = POS.test(headline);
  const neg = NEG.test(headline);
  const sentiment = pos && !neg ? 0.6 : neg && !pos ? -0.6 : 0;
  const kind = POLICY.test(headline) ? "regulation" : sentiment > 0 ? "breakthrough" : "market";
  return { sector, sentiment, kind };
}

/** LLM refinement may move sentiment by at most 0.4 and keeps the sign unless the keyword was neutral. */
export function boundRefinement(base: { sector: SectorId; sentiment: number }, refined: { sector: SectorId; sentiment: number }, allowedSectors: SectorId[]): { sector: SectorId; sentiment: number } {
  const sector = allowedSectors.includes(refined.sector) ? refined.sector : base.sector;
  let s = clamp(refined.sentiment, base.sentiment - 0.4, base.sentiment + 0.4);
  if (base.sentiment > 0) s = Math.max(0, s);
  if (base.sentiment < 0) s = Math.min(0, s);
  return { sector, sentiment: clamp(s, -1, 1) };
}
