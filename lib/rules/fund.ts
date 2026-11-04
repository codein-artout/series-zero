/** Fund scoring (GAME.md section 12). Pure. */
import type { GameConfig } from "@/config/game";
import { percentileRanks } from "./math";

export interface Position {
  companyId: string;
  cost: number;
  share: number;
  mark: number;
  proceeds: number;
  status: "live" | "exited" | "written_off";
}

export function positionValue(p: Position): number {
  return p.status === "live" ? p.share * p.mark : 0;
}

export function positionMultiple(p: Position): number {
  return p.cost > 0 ? (p.proceeds + positionValue(p)) / p.cost : 0;
}

/** TVPI (shown as MOIC) = (distributions + sum(ownership x mark of live holdings)) / paidIn */
export function tvpi(distributions: number, positions: Position[], paidIn: number): number {
  if (paidIn <= 0) return 0;
  return (distributions + positions.reduce((a, p) => a + positionValue(p), 0)) / paidIn;
}

export function hitRate(positions: Position[], cfg: GameConfig): { hits: number; total: number; rate: number } {
  const total = positions.length;
  const hits = positions.filter((p) => positionMultiple(p) >= cfg.vc.hitThreshold).length;
  return { hits, total, rate: total ? hits / total : 0 };
}

export interface BoardRow {
  id: string;
  tvpi: number;
  hitRate: number;
  investments: number;
}

/** Sorted by TVPI, tie-break hit rate; needs vc.minInvestmentsForBoard checks to be listed. */
export function fundLeaderboard(rows: BoardRow[], cfg: GameConfig): BoardRow[] {
  return rows
    .filter((r) => r.investments >= cfg.vc.minInvestmentsForBoard)
    .sort((a, b) => b.tvpi - a.tvpi || b.hitRate - a.hitRate || (a.id < b.id ? -1 : 1));
}

/** VC reputation targets from percentiles of TVPI and hit rate across funds. */
export function vcTargets(rows: BoardRow[]): Map<string, number> {
  const pt = percentileRanks(rows.map((r) => r.tvpi));
  const ph = percentileRanks(rows.map((r) => r.hitRate));
  return new Map(rows.map((r, i) => [r.id, 100 * (0.7 * pt[i] + 0.3 * ph[i])]));
}

/** Pro-rata follow-on: keep ownership in the new round. */
export function proRataAmount(share: number, roundCheck: number, round: number): number {
  const raw = share * roundCheck;
  return Math.round(raw / round) * round;
}

/** Investable dry powder after holding back reserves for follow-ons. */
export function deployable(dryPowder: number, size: number, cfg: GameConfig): number {
  return Math.max(0, dryPowder - cfg.vc.reserveRatio * size);
}
