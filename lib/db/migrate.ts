import fs from "node:fs";
import path from "node:path";

export type SqlExec = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export function migrationsDir(): string {
  return path.resolve(process.cwd(), "prisma/migrations");
}

export function listMigrations(dir = migrationsDir()): Array<{ name: string; sql: string }> {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, "migration.sql")))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8") }));
}

/**
 * Applies committed SQL migrations in order, once each. Tracks them in `_sz_migrations`.
 * Compatible with Prisma's own `_prisma_migrations`: on Neon you may use `prisma migrate deploy` instead.
 */
export async function applyMigrations(exec: SqlExec, dir = migrationsDir()): Promise<string[]> {
  await exec(`CREATE TABLE IF NOT EXISTS "_sz_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP NOT NULL DEFAULT now())`);
  const prismaApplied = await exec(`SELECT to_regclass('public._prisma_migrations') AS t`);
  const done = new Set((await exec(`SELECT "name" FROM "_sz_migrations"`)).map((r) => String(r.name)));
  if (prismaApplied[0]?.t) {
    for (const r of await exec(`SELECT "migration_name" AS name FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`)) done.add(String(r.name));
  }
  const applied: string[] = [];
  for (const m of listMigrations(dir)) {
    if (done.has(m.name)) continue;
    await exec("BEGIN");
    try {
      await exec(m.sql);
      await exec(`INSERT INTO "_sz_migrations" ("name") VALUES ($1)`, [m.name]);
      await exec("COMMIT");
    } catch (e) {
      await exec("ROLLBACK");
      throw new Error(`migration ${m.name} failed: ${(e as Error).message}`);
    }
    applied.push(m.name);
  }
  return applied;
}
