/**
 * Server orchestration around the engine: one in-process mutex, load -> mutate -> save, with an
 * optimistic-version retry. Used by route handlers, server actions, the tick CLI and cron.
 */
import { randomBytes } from "node:crypto";
import { loadGameConfig } from "@/config/load";
import type { GameConfig } from "@/config/game";
import { ConflictError, PrismaWorldRepo, type WorldRepo } from "@/lib/db/repo";
import { runTick, type TickSummary } from "@/lib/sim/engine";
import { populate } from "@/lib/sim/seedworld";
import { createWorld } from "@/lib/sim/genesis";
import type { World } from "@/lib/sim/types";
import { deliverPushes } from "./push";

const g = globalThis as unknown as { __szLock?: Promise<unknown> };

function lock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = g.__szLock ?? Promise.resolve();
  const next = prev.then(fn, fn);
  g.__szLock = next.catch(() => undefined);
  return next;
}

let repoOverride: WorldRepo | null = null;
export function setRepo(r: WorldRepo | null): void {
  repoOverride = r;
}
function repo(): WorldRepo {
  return repoOverride ?? new PrismaWorldRepo();
}

export function newSeasonSeed(): string {
  return process.env.SEASON_SEED || randomBytes(24).toString("hex");
}

/** Creates a minimal world (no ticks run) when the DB is empty, so the app never 500s. */
async function bootstrap(cfg: GameConfig): Promise<World> {
  const w = createWorld(newSeasonSeed(), cfg);
  await populate(w, cfg, { demo: true });
  return w;
}

export async function withWorld<T>(fn: (w: World, cfg: GameConfig) => Promise<T>, opts: { save?: boolean } = {}): Promise<T> {
  const cfg = loadGameConfig();
  return lock(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = repo();
      const w = (await r.load()) ?? (await bootstrap(cfg));
      const out = await fn(w, cfg);
      if (opts.save === false) return out;
      try {
        await r.save(w);
        return out;
      } catch (e) {
        if (e instanceof ConflictError && attempt === 0) continue;
        throw e;
      }
    }
    throw new Error("unreachable");
  });
}

export interface AdvanceResult {
  ran: TickSummary[];
  skipped: boolean;
  tick: number;
  season: number;
}

/**
 * Advances the world. Idempotent per tick number: with `toTick`, ticks already run are skipped;
 * calling twice for the same tick runs it once.
 */
export async function advance(opts: { count?: number; toTick?: number } = {}): Promise<AdvanceResult> {
  const out = await withWorld(async (w, cfg) => {
    const ran: TickSummary[] = [];
    const total = cfg.season.days * cfg.ticks.perDay;
    const target = opts.toTick ?? w.season.tick + (opts.count ?? 1);
    while (w.season.tick < Math.min(target, total) && w.season.status === "running") {
      ran.push(await runTick(w, cfg, { nextSeed: newSeasonSeed }));
      if (w.season.tick === 0) break; // rolled into a new season
    }
    return { ran, skipped: ran.length === 0, tick: w.season.tick, season: w.season.number, notifications: w.appended.notifications.slice() };
  });
  await deliverPushes(out.notifications);
  return { ran: out.ran, skipped: out.skipped, tick: out.tick, season: out.season };
}
