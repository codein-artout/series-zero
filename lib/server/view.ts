/**
 * Read models for screens. The mutable world is loaded once per request (React cache); logs are
 * read with Prisma. Nothing here mutates state. Hidden variables are never returned.
 */
import { cache } from "react";
import type { GameConfig, SectorId } from "@/config/game";
import { loadGameConfig } from "@/config/load";
import { prisma } from "@/lib/db/client";
import { PrismaWorldRepo } from "@/lib/db/repo";
import type { TapeItem, NavLinks } from "@/components/ui";
import { deltaPct, direction, multiple, scripShort } from "@/lib/format";
import { DEMO_USER_ID } from "@/lib/sim/seedworld";
import { fundMetrics } from "@/lib/sim/funds";
import { companyRunway, revenuePerDay } from "@/lib/sim/company";
import { cash, liveCompanies, sectorGrowth7d, walletAccount } from "@/lib/sim/world";
import type { Company, Decision, Pitch, Post, World } from "@/lib/sim/types";
import { currentUser, type Viewer } from "./session";
import { withWorld } from "./world";

export const config = (): GameConfig => loadGameConfig();

export const getWorld = cache(async (): Promise<World> => {
  const w = await new PrismaWorldRepo().load();
  if (w) return w;
  // First run without a seed: bootstrap a minimal world (persisted), then load it.
  await withWorld(async () => undefined);
  return (await new PrismaWorldRepo().load())!;
});

export const getViewer = cache(async (): Promise<Viewer | null> => currentUser());

/** Whose perspective the screens show: the signed-in user, else the demo coach (read-only). */
export interface Perspective {
  userId: string;
  canAct: boolean;
  viewer: Viewer | null;
  spectating: boolean;
}

export const getPerspective = cache(async (): Promise<Perspective> => {
  const viewer = await getViewer();
  if (viewer) return { userId: viewer.id, canAct: true, viewer, spectating: false };
  return { userId: DEMO_USER_ID, canAct: false, viewer: null, spectating: true };
});

export function sectorName(cfg: GameConfig, id: SectorId): string {
  return cfg.sectors.find((s) => s.id === id)?.name ?? id;
}

export function markChange7d(c: Company, marks: Array<{ tick: number; mark: number }>, cfg: GameConfig): number {
  if (!marks.length) return 0;
  const last = marks[marks.length - 1];
  const prev = [...marks].reverse().find((m) => m.tick <= last.tick - cfg.ticks.perWeek) ?? marks[0];
  return prev.mark > 0 ? last.mark / prev.mark - 1 : 0;
}

/** 7-day mark change for every live company (one query). */
export const getMarkChanges = cache(async (): Promise<Map<string, number>> => {
  const w = await getWorld();
  const cfg = config();
  const db = await prisma();
  const since = w.season.tick - cfg.ticks.perWeek;
  const rows = await db.mark.findMany({ where: { seasonId: w.season.id, tick: { in: [since, w.season.tick] } } });
  const out = new Map<string, number>();
  const by = new Map<string, { a?: number; b?: number }>();
  for (const r of rows) {
    const e = by.get(r.companyId) ?? {};
    if (r.tick === since) e.a = r.mark;
    else e.b = r.mark;
    by.set(r.companyId, e);
  }
  for (const [id, e] of by) {
    const c = w.companies.get(id);
    // Marks of young companies are still converging (EMA from zero); report no 7-day change yet.
    const mature = c ? c.createdTick <= since - cfg.ticks.perWeek : false;
    out.set(id, mature && e.a && e.b ? e.b / e.a - 1 : 0);
  }
  return out;
});

export interface ShellData {
  tape: TapeItem[];
  links: NavLinks;
  balance?: string;
  burnToday?: string;
  wireCount: number;
}

export const getShell = cache(async (): Promise<ShellData> => {
  const w = await getWorld();
  const cfg = config();
  const p = await getPerspective();
  const changes = await getMarkChanges();
  const live = liveCompanies(w);
  const movers = [...live].sort((a, b) => Math.abs(changes.get(b.id) ?? 0) - Math.abs(changes.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1)).slice(0, 3);
  const mine = [...w.founders.values()].filter((f) => f.ownerId === p.userId).sort((a, b) => b.createdTick - a.createdTick)[0];
  const myCo = mine?.companyId ? w.companies.get(mine.companyId) : [...w.companies.values()].filter((c) => c.founderId === mine?.id).sort((a, b) => b.createdTick - a.createdTick)[0];
  const myFund = [...w.funds.values()].find((f) => f.ownerId === p.userId);
  const hypePrev = w.season.hypeHistory[Math.max(0, w.season.hypeHistory.length - 1 - cfg.ticks.perDay)] ?? w.season.hype;
  const topPool = [...w.sectors].sort((a, b) => b.pool - a.pool);
  const tape: TapeItem[] = [];
  if (myCo && (myCo.status === "alive" || myCo.status === "zombie")) {
    const d = changes.get(myCo.id) ?? 0;
    tape.push({ name: myCo.name.toUpperCase(), value: scripShort(myCo.mark), delta: { text: deltaPct(d), dir: direction(d) } });
  }
  for (const c of movers.filter((m) => m.id !== myCo?.id)) {
    const d = changes.get(c.id) ?? 0;
    tape.push({ name: c.name.toUpperCase(), value: scripShort(c.mark), delta: { text: deltaPct(d), dir: direction(d) } });
  }
  const hd = w.season.hype - hypePrev;
  tape.push({ name: "HYPE INDEX", value: String(Math.round(w.season.hype)), delta: { text: `${hd >= 0.5 ? "▲" : hd <= -0.5 ? "▼" : "►"} ${Math.abs(Math.round(hd))}`, dir: hd >= 0.5 ? "up" : hd <= -0.5 ? "dn" : "flat" } });
  const lapse = [...w.offers.values()].filter((o) => o.status === "open" && myCo && o.companyId === myCo.id).sort((a, b) => a.expiresTick - b.expiresTick)[0];
  if (lapse) tape.push({ name: "OFFER LAPSES", value: `in ${lapse.expiresTick - w.season.tick} ticks`, urgent: true });
  const bestFund = [...w.funds.values()].map((f) => ({ f, m: fundMetrics(w, cfg, f) })).sort((a, b) => b.m.tvpi - a.m.tvpi)[0];
  if (bestFund) tape.push({ name: bestFund.f.name.split(" ")[0].toUpperCase(), value: `MOIC ${multiple(bestFund.m.tvpi)}` });
  for (const s of topPool.slice(0, 2)) {
    const g = sectorGrowth7d(s, cfg);
    tape.push({ name: `${sectorName(cfg, s.id).toUpperCase()} POOL`, value: scripShort(s.pool), delta: { text: deltaPct(g), dir: direction(g) } });
  }
  const db = await prisma();
  const wireCount = await db.post.count({ where: { seasonId: w.season.id, tick: { gte: w.season.tick - 1 }, hidden: false } });
  const lastPitch = myCo ? await db.pitch.findFirst({ where: { companyId: myCo.id }, orderBy: { tick: "desc" } }) : null;
  const latestAny = lastPitch ?? (await db.pitch.findFirst({ where: { seasonId: w.season.id }, orderBy: [{ tick: "desc" }, { id: "desc" }] }));
  const bal = w.ledger.balance(walletAccount(p.userId));
  const burn = myCo && (myCo.status === "alive" || myCo.status === "zombie") ? Math.round((myCo.lastBurn ?? 0) * cfg.ticks.perDay) : 0;
  return {
    tape,
    links: {
      pitch: latestAny ? `/pitch/${latestAny.id}` : "/",
      founder: myCo ? `/company/${myCo.id}` : "/create",
      fund: myFund ? `/fund/${myFund.id}` : "/create?tab=vc",
      cards: "/cards",
    },
    balance: `§ ${bal.toLocaleString("en-US")}`,
    burnToday: burn ? `Company burn today −${scripShort(burn)}` : undefined,
    wireCount: Math.min(wireCount, 99),
  };
});

export function decisionsFor(w: World, userId: string): Decision[] {
  return [...w.decisions.values()].filter((d) => d.userId === userId && d.status === "open").sort((a, b) => a.expiresTick - b.expiresTick || (a.id < b.id ? -1 : 1));
}

export async function postsFeed(w: World, filter: "all" | "founders" | "vcs" | "flagged", take = 40): Promise<Post[]> {
  const db = await prisma();
  const where = { seasonId: w.season.id, hidden: false, ...(filter === "founders" ? { authorType: "founder" } : filter === "vcs" ? { authorType: "vc" } : filter === "flagged" ? { kind: "fraud" } : {}) };
  const rows = await db.post.findMany({ where, orderBy: [{ tick: "desc" }, { id: "desc" }], take });
  return rows.map((r) => ({ ...(r.state as unknown as Post), cosigns: r.cosigns, roasts: r.roasts, hidden: r.hidden }));
}

export async function getPitch(id: string): Promise<Pitch | null> {
  const db = await prisma();
  const r = await db.pitch.findUnique({ where: { id } });
  return r ? (r.state as unknown as Pitch) : null;
}

export async function companyMarks(w: World, companyId: string): Promise<Array<{ tick: number; mark: number }>> {
  const db = await prisma();
  const rows = await db.mark.findMany({ where: { companyId, seasonId: w.season.id }, orderBy: { tick: "asc" }, select: { tick: true, mark: true } });
  return rows;
}

export async function sectorMedianMarks(w: World, sector: string, fromTick: number): Promise<Array<{ tick: number; value: number }>> {
  const h = await (await import("@/lib/db/client")).getDb();
  const rows = await h.exec(
    `SELECT tick, percentile_cont(0.5) WITHIN GROUP (ORDER BY mark) AS m FROM "Mark" WHERE "seasonId"=$1 AND sector=$2 AND tick >= $3 GROUP BY tick ORDER BY tick`,
    [w.season.id, sector, fromTick],
  );
  return rows.map((r) => ({ tick: Number(r.tick), value: Number(r.m) }));
}

export function companyStats(w: World, cfg: GameConfig, c: Company) {
  const runway = companyRunway(w, cfg, c);
  return {
    cash: cash(w, c),
    runway,
    burnPerDay: c.lastBurn * cfg.ticks.perDay,
    revenuePerDay: revenuePerDay(c, cfg),
    revenueAnnual: revenuePerDay(c, cfg) * 365,
  };
}

export function ticksLeft(w: World, cfg: GameConfig): number {
  return cfg.season.days * cfg.ticks.perDay - w.season.tick;
}

/** Wall-clock time of the next scheduled tick in the game time zone. */
export function nextTickAt(cfg: GameConfig, now = new Date()): Date {
  const tz = cfg.ticks.timezone;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secNow = get("hour") * 3600 + get("minute") * 60 + get("second");
  const slots = cfg.ticks.schedule.map((s) => Number(s.slice(0, 2)) * 3600 + Number(s.slice(3, 5)) * 60).sort((a, b) => a - b);
  const next = slots.find((s) => s > secNow) ?? slots[0] + 86400;
  return new Date(now.getTime() + (next - secNow) * 1000);
}
