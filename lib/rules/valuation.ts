/** Relative valuation, outcome ladder and exits (GAME.md section 9). Pure. */
import type { Ambition, GameConfig } from "@/config/game";
import { clamp, median, percentileRanks } from "./math";

export interface ValInput {
  id: string;
  growth: number;
  revenueAnnual: number;
  efficiency: number;
}

export interface ValScore {
  id: string;
  S: number;
  pct: { growth: number; scale: number; efficiency: number };
  belowMedian: boolean;
}

/** Composite S per company (percentiles or small-sector bands, then the below-median cap). */
export function compositeScores(items: ValInput[], cfg: GameConfig): ValScore[] {
  const v = cfg.valuation;
  const pg = percentileRanks(items.map((i) => i.growth));
  const ps = percentileRanks(items.map((i) => i.revenueAnnual));
  const pe = percentileRanks(items.map((i) => i.efficiency));
  const raw = items.map((_, k) => v.wGrowth * pg[k] + v.wScale * ps[k] + v.wEfficiency * pe[k]);
  const med = median(items.map((i) => i.growth));
  let S = raw;
  if (items.length < cfg.sector.minCompanies) {
    // Bands by rank of the raw composite: top third 0.8, middle 0.5, bottom 0.2.
    const order = raw.map((r, k) => ({ r, k, id: items[k].id })).sort((a, b) => b.r - a.r || (a.id < b.id ? -1 : 1));
    S = new Array(items.length).fill(0);
    const n = items.length;
    order.forEach((o, rank) => {
      const third = Math.floor((rank * 3) / n);
      S[o.k] = cfg.valuation.smallBands[Math.min(2, third)];
    });
  }
  return items.map((it, k) => {
    const belowMedian = it.growth <= med;
    return { id: it.id, S: belowMedian ? Math.min(S[k], v.belowMedianCap) : S[k], pct: { growth: pg[k], scale: ps[k], efficiency: pe[k] }, belowMedian };
  });
}

export function sectorValue(poolAnnual: number, H: number, cfg: GameConfig): number {
  return poolAnnual * cfg.valuation.poolMultiple * (1 + cfg.valuation.hypeAdj * ((H - 50) / 50));
}

/**
 * Steep slice: weight = S^slicePower, target_i = V * w_i / sum(w). Revenue floor: companies whose
 * slice is below floorMultiple x annual revenue are fixed at the floor first; the rest share what remains.
 */
export function sliceTargets(items: Array<{ id: string; S: number; revenueAnnual: number }>, V: number, cfg: GameConfig): Map<string, number> {
  const out = new Map<string, number>();
  const floorOf = (i: { revenueAnnual: number }) => cfg.valuation.revenueFloorMultiple * Math.max(0, i.revenueAnnual);
  let free = [...items];
  let remaining = V;
  for (let guard = 0; guard < items.length + 1; guard++) {
    const wsum = free.reduce((a, i) => a + Math.pow(Math.max(0, i.S), cfg.valuation.slicePower), 0);
    const share = (i: { S: number }) => (wsum > 0 ? (remaining * Math.pow(Math.max(0, i.S), cfg.valuation.slicePower)) / wsum : free.length ? remaining / free.length : 0);
    const floored = free.filter((i) => share(i) < floorOf(i));
    if (!floored.length) {
      for (const i of free) out.set(i.id, Math.max(0, share(i)));
      return out;
    }
    for (const i of floored) {
      out.set(i.id, floorOf(i));
      remaining -= floorOf(i);
    }
    remaining = Math.max(0, remaining);
    free = free.filter((i) => !floored.includes(i));
    if (!free.length) return out;
  }
  for (const i of free) out.set(i.id, 0);
  return out;
}

/** mark' = mark + ema (target - mark) */
export function smoothMark(mark: number, target: number, cfg: GameConfig): number {
  return mark + cfg.valuation.ema * (target - mark);
}

// ---------- Outcomes ----------

export type Rung = "dead" | "IPO" | "acquired" | "unicorn" | "zombie" | "operating";

export interface OutcomeInput {
  id: string;
  status: "alive" | "zombie" | "dead" | "acquired" | "public";
  mark: number;
  exitedThisSeason: boolean;
}

/** Season-end assignment in GAME.md order: dead, IPO (top slots above threshold), acquired, unicorn, zombie, operating. */
export function assignOutcomes(items: OutcomeInput[], slotsLeft: number, cfg: GameConfig): Map<string, Rung> {
  const out = new Map<string, Rung>();
  const o = cfg.outcome;
  const ipoCandidates = items
    .filter((i) => i.status === "alive" || i.status === "zombie")
    .filter((i) => i.mark >= o.ipoValuation)
    .sort((a, b) => b.mark - a.mark || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(0, Math.min(o.ipoSlotsPerSeason, slotsLeft)))
    .map((i) => i.id);
  for (const i of items) {
    if (i.status === "dead") out.set(i.id, "dead");
    else if (ipoCandidates.includes(i.id) || i.status === "public") out.set(i.id, "IPO");
    else if (i.exitedThisSeason || i.status === "acquired") out.set(i.id, "acquired");
    else if (i.mark >= o.unicornValuation) out.set(i.id, "unicorn");
    else if (i.status === "zombie") out.set(i.id, "zombie");
    else out.set(i.id, "operating");
  }
  return out;
}

// ---------- Exits ----------

export function exitEligible(p: { ageDays: number; percentile: number; revenueAnnual: number; status: string }, cfg: GameConfig): boolean {
  const e = cfg.exit;
  return (p.status === "alive" || p.status === "zombie") && p.ageDays >= e.minAgeDays && p.percentile >= e.minPercentile && p.revenueAnnual >= e.minRevenue;
}

export function bidProbability(percentile: number, H: number, cfg: GameConfig): number {
  return clamp(cfg.exit.bidProbBase * (1 + percentile) * (1 + (H - 50) / 100), 0, 1);
}

/** premium ~ LogNormal(mu, sigma) capped at maxPremium; bid = mark (1 + premium). */
export function bidFromPremium(mark: number, premiumDraw: number, cfg: GameConfig): { premium: number; bid: number } {
  const premium = Math.min(cfg.exit.maxPremium, Math.max(0, premiumDraw));
  return { premium, bid: Math.round(mark * (1 + premium)) };
}

export function acceptsExit(bid: number, mark: number, ambition: Ambition, cfg: GameConfig): boolean {
  return mark > 0 && bid / mark >= cfg.ambition.exitAcceptance[ambition];
}

export interface ExitSplit {
  fee: number;
  net: number;
  funds: Array<{ fundId: string; amount: number }>;
  founderProceeds: number;
  founderWallet: number;
  realizedValue: number;
}

/** Exit payouts: fee to BURN; each fund gets ownership x (price - fee); founder wallet gets a capped sliver. */
export function exitSplit(price: number, cap: Array<{ holderType: string; holderId: string | null; share: number }>, cfg: GameConfig): ExitSplit {
  const fee = Math.round(price * cfg.fees.exitRate);
  const net = price - fee;
  const byFund = new Map<string, number>();
  for (const c of cap) if (c.holderType === "fund" && c.holderId) byFund.set(c.holderId, (byFund.get(c.holderId) ?? 0) + c.share);
  const funds = [...byFund.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([fundId, share]) => ({ fundId, amount: Math.floor(share * net) }));
  const founderShare = cap.filter((c) => c.holderType === "founder").reduce((a, c) => a + c.share, 0);
  const founderProceeds = founderShare * net;
  const founderWallet = Math.floor(Math.min(cfg.economy.exitWalletCap, cfg.economy.exitWalletRatio * founderProceeds));
  const paid = funds.reduce((a, f) => a + f.amount, 0);
  return { fee, net, funds, founderProceeds, founderWallet, realizedValue: Math.max(0, net - paid) };
}
