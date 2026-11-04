/** Company rules (GAME.md sections 5.4, 5.5, 8). Pure. */
import type { Ambition, GameConfig, PriceTier } from "@/config/game";
import type { Traits } from "@/lib/sim/types";
import { clamp, clamp01 } from "./math";

export function burnPerDay(headcount: number, marketingLevel: number, cfg: GameConfig): number {
  const c = cfg.company;
  return c.baseOpsPerDay + headcount * c.salaryPerHeadPerDay + c.marketingCost[clamp(Math.round(marketingLevel), 0, c.marketingCost.length - 1)];
}

/** team = clamp(teamSeed * (0.6 + 0.4 * (1 - exp(-headcount / 10))), 0.1, 1) */
export function teamQuality(teamSeed: number, headcount: number, cfg: GameConfig): number {
  const c = cfg.company;
  return clamp(teamSeed * (c.teamBase + (1 - c.teamBase) * (1 - Math.exp(-headcount / c.teamHeadScale))), c.teamMin, c.teamMax);
}

/** z' = rho z + sqrt(1 - rho^2) eps */
export function luckStep(z: number, eps: number, cfg: GameConfig): number {
  const r = cfg.company.luckRho;
  return r * z + Math.sqrt(1 - r * r) * eps;
}

export function luckFactor(z: number, cfg: GameConfig): number {
  return Math.exp(cfg.company.luckSigma * z);
}

/** s = q^a * execution^b * team^c * m^d * luck, m = 1 + 0.35 * marketingLevel */
export function productScore(p: { q: number; execution: number; team: number; marketingLevel: number; luck: number }, cfg: GameConfig): number {
  const e = cfg.company.exp;
  const m = 1 + cfg.company.marketingStep * p.marketingLevel;
  return Math.pow(Math.max(0, p.q), e.q) * Math.pow(Math.max(0, p.execution), e.execution) * Math.pow(Math.max(0, p.team), e.team) * Math.pow(m, e.marketing) * p.luck;
}

/** poolTick = P_annual / 365 / perDay * penetration * stabilizer */
export function poolPerTick(poolAnnual: number, stabilizer: number, cfg: GameConfig): number {
  return (poolAnnual / 365 / cfg.ticks.perDay) * cfg.sector.penetration * stabilizer;
}

/** Shares u_i / sum(u) with u_i = s_i^concentration * tierDemand * traction. Sum to 1 (or all 0). */
export function demandShares(items: Array<{ s: number; tier: PriceTier; traction: number }>, cfg: GameConfig): number[] {
  const u = items.map((i) => Math.pow(Math.max(0, i.s), cfg.company.concentration) * cfg.company.tierDemand[i.tier] * Math.max(0, i.traction));
  const total = u.reduce((a, b) => a + b, 0);
  return total > 0 ? u.map((x) => x / total) : u.map(() => 0);
}

/** rev_i = poolTick * share_i * tierPrice */
export function revenueSplit(poolTick: number, items: Array<{ s: number; tier: PriceTier; traction: number }>, cfg: GameConfig): number[] {
  const shares = demandShares(items, cfg);
  return shares.map((sh, i) => poolTick * sh * cfg.company.tierPrice[items[i].tier]);
}

export const INFINITE_RUNWAY = Number.POSITIVE_INFINITY;

/** runwayDays = cash / (burn - revenue) if positive net burn, else infinite (ramen profitable). */
export function runwayDays(cash: number, burnDay: number, revenueDay: number): number {
  const net = burnDay - revenueDay;
  if (net <= 0) return INFINITE_RUNWAY;
  return Math.max(0, cash) / net;
}

/** growth7d raw = revenue(last 21 ticks) / revenue(previous 21 ticks) - 1 */
export function rawGrowth7d(history: readonly number[], cfg: GameConfig): number {
  const n = cfg.ticks.perWeek;
  if (history.length < n + 1) {
    // Young company: compare halves of what exists.
    if (history.length < 4) return 0;
    const half = Math.floor(history.length / 2);
    const a = history.slice(0, half).reduce((x, y) => x + y, 0) / half;
    const b = history.slice(half).reduce((x, y) => x + y, 0) / (history.length - half);
    return a > 0 ? b / a - 1 : 0;
  }
  const last = history.slice(-n).reduce((x, y) => x + y, 0);
  const prev = history.slice(-2 * n, -n);
  const prevSum = prev.reduce((x, y) => x + y, 0);
  if (prevSum <= 0) return last > 0 ? 1 : 0;
  return last / prevSum - 1;
}

export function smoothGrowth(prev: number, raw: number, cfg: GameConfig): number {
  return prev + cfg.company.growthEma * (raw - prev);
}

/** Weekly hiring: +1 (+2 if risk > 0.7, + ambition bias) when runway > 60d and growth > 5%; -1 when runway < 30d. */
export function hiringDelta(p: { runway: number; growth: number; risk: number; ambition: Ambition }, cfg: GameConfig): number {
  const h = cfg.hiring;
  if (p.runway < h.layoffRunwayDays) return -1;
  if (p.runway > h.minRunwayDays && p.growth > h.minGrowth) return (p.risk > h.highRiskAt ? 2 : 1) + cfg.ambition.hireBias[p.ambition];
  return 0;
}

/** Marketing level = round(risk * 3), capped to 1 when runway < 45 days. */
export function marketingLevel(risk: number, runway: number, cfg: GameConfig): number {
  const lvl = clamp(Math.round(risk * cfg.marketing.maxLevel), 0, cfg.marketing.maxLevel);
  return runway < cfg.marketing.lowRunwayDays ? Math.min(lvl, cfg.marketing.lowRunwayCap) : lvl;
}

export function priceTier(t: Traits, ambition: Ambition, cfg: GameConfig): PriceTier {
  if (t.ethics > cfg.price.ethicsDiscountAt && ambition === "lifestyle") return "discount";
  if (t.riskAppetite > cfg.price.riskPremiumAt && t.ethics < cfg.price.ethicsPremiumBelow) return "premium";
  return "standard";
}

/** Raise when runway < trigger; moonshots also raise at a stage gate (no round at this stage yet, growing, runway < 2x trigger). */
export function shouldStartRaising(p: { runway: number; ambition: Ambition; raisedAtStage: boolean; growth: number }, cfg: GameConfig): boolean {
  if (p.runway < cfg.fundraise.triggerRunwayDays) return true;
  return p.ambition === "moonshot" && !p.raisedAtStage && p.growth > cfg.hiring.minGrowth && p.runway < 2 * cfg.fundraise.triggerRunwayDays;
}

/** pivotScore = 0.4 min(1, rejections/3) + 0.3 competitorPressure + 0.3 burnPressure */
export function pivotScore(p: { rejections: number; sectorPercentile: number; peers: number; runway: number }, cfg: GameConfig): number {
  const v = cfg.pivot;
  const rej = Math.min(1, p.rejections / v.rejectionsNorm);
  const comp = p.peers >= v.minPeers ? 1 - clamp01(p.sectorPercentile) : 0;
  const burn = clamp01((v.burnRunwayDays - (Number.isFinite(p.runway) ? p.runway : 1e9)) / v.burnRunwayDays);
  return v.wRejections * rej + v.wCompetitor * comp + v.wBurn * burn;
}

export function pivotThreshold(ambition: Ambition, runway: number, cfg: GameConfig): number {
  if (ambition === "moonshot" && runway < cfg.ambition.moonshotPivotRunwayDays) return cfg.pivot.threshold;
  return cfg.pivot.threshold + cfg.ambition.pivotThresholdAdj[ambition];
}

export function shouldProposePivot(p: { score: number; ambition: Ambition; runway: number; tick: number; lastPivotTick: number }, cfg: GameConfig): boolean {
  return p.score >= pivotThreshold(p.ambition, p.runway, cfg) && p.tick - p.lastPivotTick > cfg.pivot.cooldownTicks;
}

/** Default for an ignored player pivot decision: veto, except approve when runway < forceRunwayDays. */
export function pivotDefault(runway: number, cfg: GameConfig): "approve" | "veto" {
  return runway < cfg.pivot.forceRunwayDays ? "approve" : "veto";
}

/** Headcount after a pivot so that burn falls to burnMult of today's. */
export function pivotHeadcount(headcount: number, marketing: number, cfg: GameConfig): { headcount: number; marketing: number } {
  const target = burnPerDay(headcount, marketing, cfg) * cfg.pivot.burnMult;
  let m = marketing;
  let h = headcount;
  while (h > cfg.hiring.minHeadcount && burnPerDay(h, m, cfg) > target) {
    if (m > 0 && cfg.company.marketingCost[m] - cfg.company.marketingCost[m - 1] > cfg.company.salaryPerHeadPerDay * 2) m -= 1;
    else h -= 1;
  }
  return { headcount: h, marketing: m };
}

export type GraceResult = { graceLeft: number; dead: boolean };

/** Debt (cash below zero) starts a grace window; recovering cash ends it; running out kills the company. */
export function graceStep(debt: number, graceLeft: number, cfg: GameConfig): GraceResult {
  if (debt <= 0) return { graceLeft: -1, dead: false };
  if (graceLeft < 0) return { graceLeft: cfg.company.graceTicks, dead: false };
  const next = graceLeft - 1;
  return { graceLeft: next, dead: next <= 0 };
}

/** Zombie: |growth| <= band for windowTicks with positive cash. Zombies above the band for recoverTicks revive. */
export function zombieStep(p: { growth: number; cash: number; zombieTicks: number; recoverTicks: number; isZombie: boolean }, cfg: GameConfig): { zombieTicks: number; recoverTicks: number; isZombie: boolean } {
  const flat = Math.abs(p.growth) <= cfg.zombie.band;
  if (!p.isZombie) {
    const zt = flat && p.cash > 0 ? p.zombieTicks + 1 : 0;
    return { zombieTicks: zt, recoverTicks: 0, isZombie: zt >= cfg.zombie.windowTicks };
  }
  const rt = p.growth > cfg.zombie.band ? p.recoverTicks + 1 : 0;
  if (rt >= cfg.zombie.recoverTicks) return { zombieTicks: 0, recoverTicks: 0, isZombie: false };
  return { zombieTicks: p.zombieTicks, recoverTicks: rt, isZombie: true };
}

/** Traction ramps toward 1 each tick (faster with marketing); pivots cut it. */
export function tractionStep(traction: number, marketingLevel: number, cfg: GameConfig): number {
  const ramp = cfg.company.tractionRamp * (1 + 0.25 * marketingLevel);
  return clamp(traction + ramp * (1 - traction), 0, 1);
}
