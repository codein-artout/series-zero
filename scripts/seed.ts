/**
 * pnpm seed: wipes the database, builds the seed world (48 founders, 12 VCs, 3 acquirers, a demo
 * player and one fraudster), runs 240 ticks in memory, then persists everything in one save.
 * Fixed seed (config seed.seasonSeed), so the output is reproducible.
 */
import fs from "node:fs";
import { loadGameConfig } from "@/config/load";
import { closeDb, getDb, pgliteDir } from "@/lib/db/client";
import { PrismaWorldRepo } from "@/lib/db/repo";
import { buildSeedWorld, DEMO_EMAIL, DEMO_USER_ID } from "@/lib/sim/seedworld";
import { visibleFeuds } from "@/lib/sim/feuds";

const cfg = loadGameConfig();
const t0 = Date.now();

if (!process.env.DATABASE_URL) {
  const dir = pgliteDir();
  if (!dir.startsWith("memory://") && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
const h = await getDb();
if (process.env.DATABASE_URL) {
  const tables = await h.exec(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '\\_%'`);
  if (tables.length) await h.exec(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} CASCADE`);
}

const seed = process.env.SEASON_SEED || cfg.seed.seasonSeed;
let ticks = 0;
const w = await buildSeedWorld(cfg, seed, {
  demo: true,
  fraudster: true,
  onTick: (r) => {
    ticks = r.number;
    if (r.number % 40 === 0) console.log(`  tick ${r.number}  hype ${r.hype.toFixed(1)}  live ${r.summary.liveCompanies}`);
  },
});
w.season.targetSupply = w.ledger.supply();
w.ledger.assertInvariant("seed");

const db = h.prisma;
await db.user.create({ data: { id: DEMO_USER_ID, email: DEMO_EMAIL, name: "Demo coach", emailVerified: new Date() } });
const counts = { posts: w.appended.posts.length, pitches: w.appended.pitches.length, marks: w.appended.marks.length, ledger: w.ledger.pending.length, demoDays: w.appended.demoDays.length };
await new PrismaWorldRepo(h).save(w);

const cos = [...w.companies.values()];
const by = (s: string) => cos.filter((c) => c.status === s).length;
console.log(`Seeded season ${w.season.number} to tick ${ticks} in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
console.log(`  companies ${cos.length}: alive ${by("alive")}, zombie ${by("zombie")}, dead ${by("dead")}, acquired ${by("acquired")}; funded ${cos.filter((c) => c.rounds > 0).length}; unicorn marks ${cos.filter((c) => c.mark >= cfg.outcome.unicornValuation).length}`);
console.log(`  posts ${counts.posts}, pitches ${counts.pitches}, marks ${counts.marks}, ledger entries ${counts.ledger}, demo days ${counts.demoDays}, feuds ${visibleFeuds(w, cfg).length}`);
console.log(`  supply §${w.ledger.supply().toLocaleString("en-US")} (target for the stabilizer). Demo login: ${DEMO_EMAIL} (magic link printed by the dev server) or use "Continue as demo" on /signin in dev.`);
await closeDb();
