import { afterAll, describe, expect, it } from "vitest";
import { Ledger, account } from "@/lib/ledger";
import { emptyAppended, type World } from "@/lib/sim/types";
import { PrismaWorldRepo, ConflictError } from "@/lib/db/repo";
import { closeDb, getDb } from "@/lib/db/client";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

function tinyWorld(): World {
  const ledger = new Ledger();
  ledger.mint(0, account("FUND", "f1"), 1000, "genesis");
  return {
    season: {
      id: "s1", number: 1, version: 0, seed: "secret", commit: "c", revealed: false, tick: 0, hype: 50, hypeHistory: [50],
      targetSupply: 0, ipoSlotsUsed: 0, demoDaysHeld: 0, status: "running", shocks: [], idSeq: 0, checksBySector: {},
    },
    sectors: [{ id: "climate", pool: 48_200_000, history: [48_200_000] }],
    founders: new Map(),
    funds: new Map(),
    acquirers: [{ id: "a1", name: "Monolith Corp" }],
    companies: new Map(),
    ideas: new Map(),
    offers: new Map(),
    deals: new Map(),
    exitOffers: new Map(),
    decisions: new Map(),
    feuds: new Map(),
    ledger,
    wallets: [],
    appended: emptyAppended(),
    recentEvents: [],
  };
}

afterAll(async () => {
  await closeDb();
});

describe("PrismaWorldRepo on PGlite", () => {
  it("applies migrations, saves and loads a world", async () => {
    const h = await getDb();
    const repo = new PrismaWorldRepo(h);
    expect(await repo.load()).toBeNull();
    const w = tinyWorld();
    w.appended.ticks.push({ number: 0, digest: "d", supply: 1000, minted: 1000, burned: 0, stabilizer: 1, hype: 50, summary: {} });
    await repo.save(w);
    const back = await repo.load();
    expect(back?.season.id).toBe("s1");
    expect(back?.sectors[0].pool).toBe(48_200_000);
    expect(back?.ledger.balance(account("FUND", "f1"))).toBe(1000);
    expect(back?.ledger.check()).toEqual([]);
    expect(await repo.hasTick("s1", 0)).toBe(true);
    expect(await repo.hasTick("s1", 1)).toBe(false);
    const rows = await h.prisma.ledgerEntry.findMany();
    expect(rows).toHaveLength(1);
  });

  it("rejects a stale write with ConflictError", async () => {
    const h = await getDb();
    const repo = new PrismaWorldRepo(h);
    const a = (await repo.load())!;
    const b = (await repo.load())!;
    a.season.tick = 1;
    await repo.save(a);
    b.season.tick = 1;
    await expect(repo.save(b)).rejects.toBeInstanceOf(ConflictError);
  });
});
