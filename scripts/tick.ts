/**
 * pnpm tick              advance one tick
 * pnpm tick --count 21   advance 21 ticks
 * pnpm tick --to 214     advance up to tick 214 (idempotent: ticks already run are skipped)
 */
import { advance } from "@/lib/server/world";
import { closeDb } from "@/lib/db/client";

const args = process.argv.slice(2);
const get = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};

const res = await advance({ count: get("--count"), toTick: get("--to") });
if (res.skipped) console.log(`Nothing to do. Season ${res.season} is at tick ${res.tick}.`);
for (const r of res.ran) console.log(`tick ${r.number}  hype ${r.hype.toFixed(1)}  supply ${r.supply}  pitches ${r.pitches}  deaths ${r.deaths}  digest ${r.digest.slice(0, 12)}`);
console.log(`Season ${res.season} now at tick ${res.tick}.`);
await closeDb();
