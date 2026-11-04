import { afterAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

import { advance, withWorld } from "@/lib/server/world";
import { closeDb, getDb } from "@/lib/db/client";
import { PrismaWorldRepo } from "@/lib/db/repo";
import { inQuietHours } from "@/lib/server/push";

afterAll(async () => {
  await closeDb();
});

describe("world service on PGlite", () => {
  it("bootstraps, advances, and is idempotent per tick number", async () => {
    const first = await advance({ toTick: 3 });
    expect(first.ran.map((r) => r.number)).toEqual([1, 2, 3]);
    const again = await advance({ toTick: 3 });
    expect(again.skipped).toBe(true);
    const h = await getDb();
    const ticks = await h.prisma.tick.findMany({ orderBy: { number: "asc" } });
    expect(ticks.map((t) => t.number)).toEqual([1, 2, 3]);
    const next = await advance({ count: 1 });
    expect(next.ran.map((r) => r.number)).toEqual([4]);
  }, 120_000);

  it("persists a world that reloads to the same digest and a balanced ledger", async () => {
    const { stateDigest } = await import("@/lib/sim/engine");
    const d1 = await withWorld(async (w) => stateDigest(w), { save: false });
    const w2 = await new PrismaWorldRepo().load();
    expect(stateDigest(w2!)).toBe(d1);
    expect(w2!.ledger.check()).toEqual([]);
    const h = await getDb();
    const sum = await h.exec(`SELECT COALESCE(SUM(balance),0)::text AS s FROM "LedgerAccount"`);
    const tot = await h.exec(`SELECT minted::text AS m, burned::text AS b FROM "LedgerTotals"`);
    expect(BigInt(String(sum[0].s))).toBe(BigInt(String(tot[0].m)) - BigInt(String(tot[0].b)));
    const replayed = await h.exec(`SELECT COALESCE(SUM(CASE WHEN "from"='MINT' THEN amount ELSE 0 END),0)::text AS m FROM "LedgerEntry"`);
    expect(BigInt(String(replayed[0].m))).toBe(BigInt(String(tot[0].m)));
  }, 120_000);

  it("quiet hours wrap midnight", () => {
    expect(inQuietHours(new Date("2026-11-04T18:00:00Z"), "Asia/Kolkata", "23:00", "08:00")).toBe(true); // 23:30 IST
    expect(inQuietHours(new Date("2026-11-04T06:00:00Z"), "Asia/Kolkata", "23:00", "08:00")).toBe(false); // 11:30 IST
  });
});
