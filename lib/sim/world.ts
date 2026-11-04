/** Shared helpers over the in-memory World. Deterministic. */
import type { GameConfig, SectorId } from "@/config/game";
import { SECTOR_IDS } from "@/config/game";
import { account, type AccountId } from "@/lib/ledger";
import { substream, type Rng } from "@/lib/rules/rng";
import type { RngDomain } from "@/config/game";
import type { Company, Fund, Id, Post, SectorState, World } from "./types";

export function nextId(w: World, prefix: string): Id {
  w.season.idSeq += 1;
  return `${prefix}_${w.season.idSeq.toString(36).padStart(5, "0")}`;
}

export function rng(w: World, tick: number, domain: RngDomain, entity: string): Rng {
  return substream(w.season.seed, tick, domain, entity);
}

export function sector(w: World, id: SectorId): SectorState {
  const s = w.sectors.find((x) => x.id === id);
  if (!s) throw new Error(`unknown sector ${id}`);
  return s;
}

export function sectorConfig(cfg: GameConfig, id: SectorId) {
  const s = cfg.sectors.find((x) => x.id === id);
  if (!s) throw new Error(`unknown sector ${id}`);
  return s;
}

/** 7-day (21 tick) pool change for a sector. */
export function sectorGrowth7d(s: SectorState, cfg: GameConfig): number {
  const h = s.history;
  if (h.length < 2) return 0;
  const back = Math.min(cfg.ticks.perWeek, h.length - 1);
  const prev = h[h.length - 1 - back];
  return prev > 0 ? s.pool / prev - 1 : 0;
}

export function allSectorGrowth(w: World, cfg: GameConfig): Record<SectorId, number> {
  return Object.fromEntries(SECTOR_IDS.map((id) => [id, sectorGrowth7d(sector(w, id), cfg)])) as Record<SectorId, number>;
}

export const companyAccount = (c: { id: Id }): AccountId => account("COMPANY", c.id);
export const fundAccount = (f: { id: Id }): AccountId => account("FUND", f.id);
export const walletAccount = (userId: Id): AccountId => account("WALLET", userId);
export const treasuryAccount = (npcId: Id): AccountId => account("TREASURY", npcId);

export function cash(w: World, c: Company): number {
  return w.ledger.balance(companyAccount(c));
}

export function dryPowder(w: World, f: Fund): number {
  return w.ledger.balance(fundAccount(f));
}

export function liveCompanies(w: World): Company[] {
  return [...w.companies.values()].filter((c) => c.status === "alive" || c.status === "zombie");
}

export function companiesInSector(w: World, id: SectorId): Company[] {
  return liveCompanies(w).filter((c) => c.sector === id);
}

export function ownerOfCompany(w: World, c: Company): Id | null {
  return w.founders.get(c.founderId)?.ownerId ?? null;
}

export function addPost(w: World, p: Omit<Post, "id" | "hidden" | "cosigns" | "roasts"> & Partial<Pick<Post, "cosigns" | "roasts">>): Post {
  const post: Post = { hidden: false, cosigns: 0, roasts: 0, ...p, id: nextId(w, "post") };
  w.appended.posts.push(post);
  return post;
}

export function addNotification(w: World, userId: Id, tick: number, type: string, text: string, href: string): void {
  w.appended.notifications.push({ id: nextId(w, "ntf"), userId, tick, type, text, href });
}

export function seasonTickCount(cfg: GameConfig): number {
  return cfg.season.days * cfg.ticks.perDay;
}

export function daysToTicks(cfg: GameConfig, days: number): number {
  return Math.round(days * cfg.ticks.perDay);
}
