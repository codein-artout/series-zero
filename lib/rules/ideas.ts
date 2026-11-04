/** Idea quality (GAME.md 5.3). The LLM never sets q; only dnaFit, clamped. */
import type { GameConfig, SectorId, Stage } from "@/config/game";
import { clamp, percentileRanks } from "./math";

const STOP = new Set("a an the and or for of to in on with that this by as at is are be from your our their it its into per".split(" "));

export function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function ideaText(i: { oneLiner: string; problem: string; solution: string; customer: string }): string {
  return `${i.oneLiner} ${i.problem} ${i.solution} ${i.customer}`;
}

/** novelty = 1 - max similarity to existing ideas, plus the duplicate flag. */
export function novelty(text: string, existing: string[], cfg: GameConfig): { novelty: number; maxSim: number; duplicate: boolean } {
  const t = tokens(text);
  let maxSim = 0;
  for (const e of existing) maxSim = Math.max(maxSim, jaccard(t, tokens(e)));
  return { novelty: 1 - maxSim, maxSim, duplicate: maxSim >= cfg.idea.duplicateAt };
}

/** Percentile of each sector's 7-day pool growth among sectors (0..1). */
export function sectorHeatFit(growth: Record<SectorId, number>, sector: SectorId): number {
  const ids = Object.keys(growth) as SectorId[];
  const pct = percentileRanks(ids.map((s) => growth[s]));
  return pct[ids.indexOf(sector)] ?? 0.5;
}

export function clampDnaFit(x: number, cfg: GameConfig): number {
  return clamp(Number.isFinite(x) ? x : cfg.idea.dnaFitMin, cfg.idea.dnaFitMin, cfg.idea.dnaFitMax);
}

/** q = clamp(0.35 + 0.25*heat + 0.20*dnaFit + 0.20*novelty + N(0, noise)) - duplicate penalty. */
export function ideaQuality(p: { heatFit: number; dnaFit: number; novelty: number; duplicate: boolean; noiseZ: number }, cfg: GameConfig): number {
  const c = cfg.idea;
  let q = c.base + c.wHeat * p.heatFit + c.wDna * clampDnaFit(p.dnaFit, cfg) + c.wNovelty * p.novelty + c.noise * p.noiseZ;
  if (p.duplicate) q -= c.duplicatePenalty;
  return clamp(q, c.qMin, c.qMax);
}

export function clampCapital(x: number, stage: Stage, cfg: GameConfig): number {
  const [lo, hi] = cfg.idea.capitalRange[stage];
  const v = Number.isFinite(x) ? x : lo;
  return Math.round(clamp(v, lo, hi) / 50_000) * 50_000;
}
