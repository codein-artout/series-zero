/**
 * Generates a new SQL migration from the change between the last snapshot of the schema and
 * prisma/schema.prisma (no database needed). Usage: pnpm db:migration <name>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const name = process.argv[2];
if (!name) throw new Error("usage: pnpm db:migration <name>");
const dir = path.resolve("prisma/migrations");
const snap = path.join(dir, "schema.snapshot.prisma");
const from = fs.existsSync(snap) ? ["--from-schema", snap] : ["--from-empty"];
const sql = execFileSync("pnpm", ["-s", "prisma", "migrate", "diff", ...from, "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8" })
  .split("\n")
  .filter((l) => !l.startsWith("Loaded Prisma"))
  .join("\n");
if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log("No schema changes.");
  process.exit(0);
}
const n = String(fs.readdirSync(dir).filter((d) => /^\d{4}_/.test(d)).length + 1).padStart(4, "0");
const out = path.join(dir, `${n}_${name}`);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "migration.sql"), sql);
fs.copyFileSync("prisma/schema.prisma", snap);
console.log(`wrote ${path.relative(process.cwd(), out)}/migration.sql`);
