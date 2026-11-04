/**
 * Prisma client factory. DATABASE_URL set: Postgres via @prisma/adapter-pg (Neon in production).
 * Otherwise: embedded PGlite at PGLITE_DIR (default ./.data/pglite; "memory://" for tests).
 * Migrations are applied on first use (lib/db/migrate.ts).
 */
import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { applyMigrations, type SqlExec } from "./migrate";

type Db = PrismaClient;

export interface DbHandle {
  prisma: Db;
  exec: SqlExec;
  /** Runs `fn` inside one SQL transaction on a single connection. */
  tx: <T>(fn: (q: SqlExec) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
  kind: "pglite" | "postgres";
}

const g = globalThis as unknown as { __szDb?: Promise<DbHandle> };

async function createPglite(dir: string): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PrismaPGlite } = await import("pglite-prisma-adapter");
  let pg: InstanceType<typeof PGlite>;
  if (dir.startsWith("memory://")) pg = new PGlite();
  else {
    fs.mkdirSync(dir, { recursive: true });
    pg = new PGlite(dir);
  }
  await pg.waitReady;
  const exec: SqlExec = async (sql, params) => {
    if (params) return (await pg.query(sql, params)).rows as Record<string, unknown>[];
    const res = await pg.exec(sql);
    return (res[res.length - 1]?.rows ?? []) as Record<string, unknown>[];
  };
  await applyMigrations(exec);
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  const tx = <T,>(fn: (q: SqlExec) => Promise<T>) =>
    pg.transaction(async (t) => fn(async (sql, params) => (await t.query(sql, params)).rows as Record<string, unknown>[]));
  return { prisma, exec, tx, kind: "pglite", close: async () => { await prisma.$disconnect(); await pg.close(); } };
}

async function createPostgres(url: string): Promise<DbHandle> {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pgMod = await import("pg");
  const pool = new pgMod.default.Pool({ connectionString: url, max: 5 });
  const exec: SqlExec = async (sql, params) => (await pool.query(sql, params)).rows as Record<string, unknown>[];
  await applyMigrations(exec);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const tx = async <T,>(fn: (q: SqlExec) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(async (sql, params) => (await client.query(sql, params)).rows as Record<string, unknown>[]);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  };
  return { prisma, exec, tx, kind: "postgres", close: async () => { await prisma.$disconnect(); await pool.end(); } };
}

export function pgliteDir(): string {
  const d = process.env.PGLITE_DIR || "./.data/pglite";
  return d.startsWith("memory://") ? d : path.resolve(d);
}

export function getDb(): Promise<DbHandle> {
  if (!g.__szDb) {
    const url = process.env.DATABASE_URL;
    g.__szDb = (url ? createPostgres(url) : createPglite(pgliteDir())).catch((e) => {
      g.__szDb = undefined;
      throw e;
    });
  }
  return g.__szDb;
}

export async function prisma(): Promise<Db> {
  return (await getDb()).prisma;
}

export async function closeDb(): Promise<void> {
  if (g.__szDb) {
    const h = await g.__szDb;
    g.__szDb = undefined;
    await h.close();
  }
}

export type { Db };
