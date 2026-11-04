/** Pure rules for founder and VC agents (GAME.md sections 3, 5, 6, 12). */
import type { Archetype, GameConfig, RedFlag, SectorId, Stage } from "@/config/game";
import { RED_FLAGS, SECTOR_IDS, STAGES } from "@/config/game";
import type { HiddenStats, MemoryEntry, Traits } from "@/lib/sim/types";
import { clamp, clamp01 } from "./math";
import type { Rng } from "./rng";

export const TRAIT_KEYS = ["riskAppetite", "ethics", "patience", "ambition"] as const;

export function randomTraits(rng: Rng): Traits {
  return { riskAppetite: rng.beta22(), ethics: rng.beta22(), patience: rng.beta22(), ambition: rng.beta22() };
}

/** Form values are authoritative; the extracted trait may differ by at most traits.maxDeviation. */
export function boundTraits(form: Traits, extracted: Partial<Traits>, cfg: GameConfig): Traits {
  const d = cfg.traits.maxDeviation;
  const out = { ...form };
  for (const k of TRAIT_KEYS) {
    const e = extracted[k];
    const v = typeof e === "number" && Number.isFinite(e) ? e : form[k];
    out[k] = clamp01(clamp(v, form[k] - d, form[k] + d));
  }
  return out;
}

const STAT_TAGS: Record<keyof HiddenStats, RegExp> = {
  execution: /\b(ship|shipping|execut\w*|operator|deliver\w*|built|build|engineer\w*)\b/i,
  teamSeed: /\b(team|hire|hiring|recruit\w*|mentor\w*|culture|people)\b/i,
  charisma: /\b(story|pitch\w*|stage|charm\w*|sell\w*|persuad\w*|network\w*)\b/i,
};

/** Beta(2,2) scaled to [stats.min, stats.max], DNA obsession tags nudge by at most stats.dnaNudge. */
export function drawHiddenStats(rng: Rng, cfg: GameConfig, dna = ""): HiddenStats {
  const { min, max, dnaNudge } = cfg.stats;
  const s = (): number => min + (max - min) * rng.beta22();
  const base: HiddenStats = { execution: s(), teamSeed: s(), charisma: s() };
  for (const k of Object.keys(STAT_TAGS) as Array<keyof HiddenStats>) {
    if (STAT_TAGS[k].test(dna)) base[k] = clamp(base[k] + dnaNudge, min, max);
  }
  return base;
}

/** Season-boundary learning: ± stats.seasonLearning from outcomes. */
export function seasonLearning(stats: HiddenStats, good: boolean, cfg: GameConfig): HiddenStats {
  const d = good ? cfg.stats.seasonLearning : -cfg.stats.seasonLearning;
  return {
    execution: clamp(stats.execution + d, cfg.stats.min, cfg.stats.max),
    teamSeed: stats.teamSeed,
    charisma: clamp(stats.charisma + d, cfg.stats.min, cfg.stats.max),
  };
}

// ---------- Memory ----------

export function addMemory(mem: MemoryEntry[], e: MemoryEntry, cfg: GameConfig): MemoryEntry[] {
  const entry = { ...e, text: e.text.slice(0, cfg.agent.memory.textMax), salience: clamp01(e.salience) };
  const next = [...mem, entry];
  if (next.length <= cfg.agent.memory.maxEntries) return next;
  // Drop the lowest salience * recency entry.
  const now = e.tick;
  let worst = 0;
  let worstScore = Infinity;
  next.forEach((m, i) => {
    const sc = memoryScore(m, now, cfg);
    if (sc < worstScore) {
      worstScore = sc;
      worst = i;
    }
  });
  next.splice(worst, 1);
  return next;
}

export function memoryScore(m: MemoryEntry, now: number, cfg: GameConfig): number {
  const age = Math.max(0, now - m.tick);
  return m.salience * Math.pow(0.5, age / cfg.agent.memory.recencyHalfLifeTicks);
}

export function topMemories(mem: MemoryEntry[], now: number, cfg: GameConfig): MemoryEntry[] {
  return [...mem]
    .map((m, i) => ({ m, i, s: memoryScore(m, now, cfg) }))
    .sort((a, b) => b.s - a.s || b.i - a.i)
    .slice(0, cfg.agent.memory.promptEntries)
    .map((x) => x.m);
}

// ---------- Reputation ----------

export function reputationStep(R: number, target: number, cfg: GameConfig): number {
  return clamp(R + cfg.reputation.alpha * (target - R), cfg.reputation.min, cfg.reputation.max);
}

export function vcReputationTarget(pctTvpi: number, pctHit: number): number {
  return 100 * (0.7 * pctTvpi + 0.3 * pctHit);
}

export function founderReputationTarget(pctComposite: number): number {
  return 100 * pctComposite;
}

export function seasonCarry(R: number, demoDayBonus: number, cfg: GameConfig): number {
  return clamp(cfg.reputation.start + cfg.reputation.seasonCarry * (R - cfg.reputation.start) + demoDayBonus, cfg.reputation.min, cfg.reputation.max);
}

// ---------- VC thesis weights, drift and herding ----------

export type Weights = Record<SectorId, number>;

/**
 * Normalise to sum 1 with every weight inside [min, max]: first renormalise, then project onto the
 * clamped simplex by finding the shift t with sum(clamp(w + t, min, max)) = 1 (bisection).
 */
export function normalizeWeights(w: Partial<Weights>, min: number, max: number): Weights {
  const ids = SECTOR_IDS;
  const raw = ids.map((s) => Math.max(0, w[s] ?? 0));
  const total = raw.reduce((a, b) => a + b, 0);
  const v = total > 0 ? raw.map((x) => x / total) : ids.map(() => 1 / ids.length);
  const f = (t: number) => v.reduce((a, x) => a + clamp(x + t, min, max), 0);
  let lo = -1 - max;
  let hi = 1 + max;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 1) lo = mid;
    else hi = mid;
  }
  const out = v.map((x) => clamp(x + (lo + hi) / 2, min, max));
  return Object.fromEntries(ids.map((s, i) => [s, out[i]])) as Weights;
}

/** GAME.md 6.5: positive dw = eta * tanh(ln(multiple)); write-off dw = -eta * lossFactor. */
export function driftDelta(event: { kind: "markup" | "exit" | "writeoff"; multiple?: number }, cfg: GameConfig): number {
  if (event.kind === "writeoff") return -cfg.vc.drift.eta * cfg.vc.drift.lossFactor;
  const m = Math.max(1e-6, event.multiple ?? 1);
  return cfg.vc.drift.eta * Math.tanh(Math.log(m));
}

export function applyDrift(w: Weights, sector: SectorId, dw: number, cfg: GameConfig): Weights {
  const next = { ...w, [sector]: w[sector] + dw } as Weights;
  return normalizeWeights(next, cfg.vc.weightMin, cfg.vc.weightMax);
}

export function peerAverageWeights(all: Weights[]): Weights {
  const out = Object.fromEntries(SECTOR_IDS.map((s) => [s, 0])) as Weights;
  if (!all.length) return normalizeWeights({}, 0, 1);
  for (const w of all) for (const s of SECTOR_IDS) out[s] += w[s] / all.length;
  return out;
}

/** GAME.md 6.4: sectorMatch = w[s]/max(w), then herding toward the peer average by phi * fomo. */
export function sectorMatchWithHerding(w: Weights, peer: Weights, sector: SectorId, fomo: number, cfg: GameConfig): number {
  const maxW = Math.max(...SECTOR_IDS.map((s) => w[s]));
  const base = maxW > 0 ? w[sector] / maxW : 0;
  const maxPeer = Math.max(...SECTOR_IDS.map((s) => peer[s]));
  const peerRel = maxPeer > 0 ? peer[sector] / maxPeer : 0;
  return Math.min(1, base + cfg.vc.herding.phi * fomo * Math.max(0, peerRel - base));
}

export function randomThesisWeights(rng: Rng, cfg: GameConfig, focus?: SectorId[]): Weights {
  const raw: Partial<Weights> = {};
  for (const s of SECTOR_IDS) raw[s] = 0.2 + rng.next() * (focus?.includes(s) ? 2.2 : 0.8);
  return normalizeWeights(raw, cfg.vc.weightMin, cfg.vc.weightMax);
}

export function randomStages(rng: Rng): Stage[] {
  const i = rng.int(3);
  if (i === 0) return ["preseed", "seed"];
  if (i === 1) return ["seed", "seriesA"];
  return ["seed"];
}

export function randomRedFlags(rng: Rng, archetype: Archetype): RedFlag[] {
  const n = archetype === "skeptic" ? 3 : archetype === "thesisDriven" ? 2 : 1;
  return rng.shuffle(RED_FLAGS).slice(0, n);
}

export function stageIndex(s: Stage): number {
  return STAGES.indexOf(s);
}
