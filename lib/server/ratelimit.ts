/** Small fixed-window rate limiter stored in the DB (works on PGlite and Postgres). */
import { getDb } from "@/lib/db/client";

export interface RateResult {
  ok: boolean;
  count: number;
  limit: number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateResult> {
  const h = await getDb();
  const start = new Date(Math.floor(now / windowMs) * windowMs);
  const rows = await h.exec(
    `INSERT INTO "RateLimit" ("key","windowStart","count") VALUES ($1,$2,1)
     ON CONFLICT ("key","windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
     RETURNING "count"`,
    [key, start.toISOString()],
  );
  const count = Number(rows[0]?.count ?? 1);
  return { ok: count <= limit, count, limit };
}

/** Read-only peek (does not consume). */
export async function rateCount(key: string, windowMs: number, now = Date.now()): Promise<number> {
  const h = await getDb();
  const start = new Date(Math.floor(now / windowMs) * windowMs);
  const rows = await h.exec(`SELECT "count" FROM "RateLimit" WHERE "key"=$1 AND "windowStart"=$2`, [key, start.toISOString()]);
  return Number(rows[0]?.count ?? 0);
}
