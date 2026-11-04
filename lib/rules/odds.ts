/**
 * Outcome odds by forward simulation (GAME.md 9.1): a reduced-form model of one company run
 * `outcome.oddsRuns` times over the remaining ticks with seeds derived from (companyId, tick).
 */
import type { Ambition, GameConfig } from "@/config/game";
import { clamp } from "./math";
import { Rng } from "./rng";

export interface OddsInput {
  companyId: string;
  tick: number;
  ticksLeft: number;
  status: "alive" | "zombie" | "dead" | "acquired" | "public";
  cash: number;
  burnPerTick: number;
  revenuePerTick: number;
  growth7d: number;
  mark: number;
  percentile: number;
  ambition: Ambition;
  hype: number;
  offerRate: number;
  roundSize: number;
}

export interface Odds {
  IPO: number;
  Unicorn: number;
  Acquired: number;
  Zombie: number;
  Dead: number;
}

export function forwardOdds(i: OddsInput, cfg: GameConfig, seedKey: string): Odds {
  const runs = cfg.outcome.oddsRuns;
  const counts: Odds = { IPO: 0, Unicorn: 0, Acquired: 0, Zombie: 0, Dead: 0 };
  if (i.status === "dead") return { ...counts, Dead: 1 };
  if (i.status === "acquired") return { ...counts, Acquired: 1 };
  if (i.status === "public") return { ...counts, IPO: 1 };
  const horizon = Math.max(1, i.ticksLeft);
  const rng = Rng.fromString(`${seedKey}|odds|${i.companyId}|${i.tick}`);
  const g0 = clamp(i.growth7d, -0.3, 0.3) / cfg.ticks.perWeek;
  for (let r = 0; r < runs; r++) {
    let cash = i.cash;
    let rev = i.revenuePerTick;
    let mark = i.mark;
    let g = g0;
    let grace = -1;
    let flat = 0;
    let outcome: keyof Odds | null = null;
    for (let t = 0; t < horizon && !outcome; t++) {
      g = 0.92 * g + 0.0015 * rng.normal();
      rev = Math.max(0, rev * (1 + g));
      cash += rev - i.burnPerTick;
      mark = Math.max(0, mark * (1 + g * 0.6 + 0.008 * rng.normal()));
      if (cash < 0) {
        if (t % cfg.fundraise.pitchEveryTicks === 0 && rng.next() < i.offerRate) cash += i.roundSize;
        grace = grace < 0 ? cfg.company.graceTicks : grace - 1;
        if (grace === 0) outcome = "Dead";
      } else grace = -1;
      flat = Math.abs(g * cfg.ticks.perWeek) <= cfg.zombie.band ? flat + 1 : 0;
      if (!outcome && i.percentile >= cfg.exit.minPercentile && rev * cfg.ticks.perDay * 365 >= cfg.exit.minRevenue) {
        const p = cfg.exit.bidProbBase * (1 + i.percentile) * (1 + (i.hype - 50) / 100);
        if (rng.next() < p) {
          const premium = Math.min(cfg.exit.maxPremium, rng.logNormal(cfg.exit.premiumMu, cfg.exit.premiumSigma));
          if (1 + premium >= cfg.ambition.exitAcceptance[i.ambition]) outcome = "Acquired";
        }
      }
    }
    if (!outcome) {
      if (mark >= cfg.outcome.ipoValuation) outcome = "IPO";
      else if (mark >= cfg.outcome.unicornValuation) outcome = "Unicorn";
      else if (flat >= cfg.zombie.windowTicks || i.status === "zombie") outcome = "Zombie";
      else outcome = rev * 3 > i.burnPerTick * 2 ? "Zombie" : "Dead";
    }
    counts[outcome] += 1;
  }
  return { IPO: counts.IPO / runs, Unicorn: counts.Unicorn / runs, Acquired: counts.Acquired / runs, Zombie: counts.Zombie / runs, Dead: counts.Dead / runs };
}
