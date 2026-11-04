/**
 * Repository layer: loads the mutable world for the current season and persists it back.
 * Mutable entities are upserted in bulk; appended records (pitches, posts, ledger entries,
 * marks...) are inserted. All writes for one save happen in a single transaction, guarded by
 * an optimistic version on the Season row.
 */
import { Ledger, type AccountId } from "@/lib/ledger";
import type {
  Acquirer,
  Company,
  Deal,
  Decision,
  ExitOffer,
  FeudState,
  FounderAgent,
  Fund,
  Idea,
  Offer,
  Season,
  SectorState,
  World,
  WorldEvent,
} from "@/lib/sim/types";
import { emptyAppended } from "@/lib/sim/types";
import { getDb, type DbHandle } from "./client";
import type { SqlExec } from "./migrate";
import { bulkUpsert, json } from "./sql";

export class ConflictError extends Error {}

export interface WorldRepo {
  load(): Promise<World | null>;
  save(world: World): Promise<void>;
  hasTick(seasonId: string, n: number): Promise<boolean>;
}

const RECENT_EVENT_TICKS = 21;

function parse<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

export class PrismaWorldRepo implements WorldRepo {
  constructor(private handle?: DbHandle) {}

  private async h(): Promise<DbHandle> {
    if (!this.handle) this.handle = await getDb();
    return this.handle;
  }

  async hasTick(seasonId: string, n: number): Promise<boolean> {
    const h = await this.h();
    const r = await h.exec(`SELECT 1 FROM "Tick" WHERE "seasonId"=$1 AND "number"=$2`, [seasonId, n]);
    return r.length > 0;
  }

  async load(): Promise<World | null> {
    const h = await this.h();
    const q = h.exec;
    const srows = await q(`SELECT * FROM "Season" WHERE "status"='running' ORDER BY "number" DESC LIMIT 1`);
    if (!srows.length) return null;
    const srow = srows[0];
    const season: Season = { ...parse<Season>(srow.state), version: Number(srow.version) };
    const seasonId = season.id;
    const sectors = (await q(`SELECT state FROM "Sector" WHERE "seasonId"=$1 ORDER BY "id"`, [seasonId])).map((r) => parse<SectorState>(r.state));
    const mapOf = <T extends { id: string }>(rows: Record<string, unknown>[]) => new Map(rows.map((r) => parse<T>(r.state)).map((x) => [x.id, x] as const));
    const founders = mapOf<FounderAgent>(await q(`SELECT state FROM "Founder" ORDER BY "id"`));
    const funds = mapOf<Fund>(await q(`SELECT state FROM "Fund" ORDER BY "id"`));
    const acquirers = (await q(`SELECT state FROM "Acquirer" ORDER BY "id"`)).map((r) => parse<Acquirer>(r.state));
    const companies = mapOf<Company>(await q(`SELECT state FROM "Company" WHERE "seasonId"=$1 ORDER BY "id"`, [seasonId]));
    const ideas = mapOf<Idea>(await q(`SELECT state FROM "Idea" ORDER BY "id"`));
    const offers = mapOf<Offer>(await q(`SELECT state FROM "Offer" WHERE "status"='open' ORDER BY "id"`));
    const deals = mapOf<Deal>(await q(`SELECT state FROM "Deal" ORDER BY "id"`));
    const exitOffers = mapOf<ExitOffer>(await q(`SELECT state FROM "ExitOffer" WHERE "status"='open' ORDER BY "id"`));
    const decisions = mapOf<Decision>(await q(`SELECT state FROM "Decision" WHERE "status"='open' ORDER BY "id"`));
    const feudRows = await q(`SELECT id, state FROM "Feud" ORDER BY "id"`);
    const feuds = new Map(feudRows.map((r) => [String(r.id), parse<FeudState>(r.state)] as const));
    const recentEvents = (
      await q(`SELECT state FROM "WorldEvent" WHERE "seasonId"=$1 AND "tick">=$2 ORDER BY "tick", "id"`, [seasonId, season.tick - RECENT_EVENT_TICKS])
    ).map((r) => parse<WorldEvent>(r.state));
    const accts = await q(`SELECT id, balance FROM "LedgerAccount" ORDER BY "id"`);
    const totals = (await q(`SELECT * FROM "LedgerTotals" WHERE id='ledger'`))[0];
    const balances: Record<string, number> = {};
    for (const a of accts) balances[String(a.id)] = Number(a.balance);
    const ledger = Ledger.fromSnapshot({
      balances,
      minted: Number(totals?.minted ?? 0),
      burned: Number(totals?.burned ?? 0),
      seq: Number(totals?.seq ?? 0),
    });
    const wallets = Object.keys(balances)
      .filter((k) => k.startsWith("WALLET:"))
      .map((k) => k.slice("WALLET:".length));
    return {
      season,
      sectors,
      founders,
      funds,
      acquirers,
      companies,
      ideas,
      offers,
      deals,
      exitOffers,
      decisions,
      feuds,
      ledger,
      wallets,
      appended: emptyAppended(),
      recentEvents,
      persistedIdeaIds: new Set(ideas.keys()),
    };
  }

  async save(world: World): Promise<void> {
    const h = await this.h();
    const entries = world.ledger.drain();
    try {
      await h.tx(async (q) => {
        await writeWorld(q, world, entries);
      });
    } catch (e) {
      // Put entries back so a retry after reload is not silently missing them.
      world.ledger.pending = [...entries, ...world.ledger.pending];
      throw e;
    }
    world.season.version += 1;
    world.appended = emptyAppended();
    world.persistedIdeaIds = new Set(world.ideas.keys());
  }
}

async function writeWorld(q: SqlExec, world: World, entries: ReturnType<Ledger["drain"]>): Promise<void> {
  const s = world.season;
  const existing = await q(`SELECT version FROM "Season" WHERE id=$1`, [s.id]);
  if (existing.length) {
    const upd = await q(
      `UPDATE "Season" SET "version"="version"+1, "tick"=$2, "status"=$3, "revealed"=$4, "state"=$5, "updatedAt"=now() WHERE id=$1 AND "version"=$6 RETURNING id`,
      [s.id, s.tick, s.status, s.revealed, json({ ...s, version: undefined }), s.version],
    );
    if (!upd.length) throw new ConflictError(`season ${s.id} changed underneath (version ${s.version})`);
  } else {
    await q(`INSERT INTO "Season" (id, number, status, tick, version, commit, seed, revealed, state, "updatedAt") VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8, now())`, [
      s.id,
      s.number,
      s.status,
      s.tick,
      s.commit,
      s.seed,
      s.revealed,
      json({ ...s, version: undefined }),
    ]);
  }
  await bulkUpsert(q, "Sector", ["seasonId", "id", "pool", "state"], world.sectors.map((x) => [s.id, x.id, x.pool, json(x)]), ["seasonId", "id"]);
  await bulkUpsert(
    q,
    "Founder",
    ["id", "ownerId", "name", "status", "reputation", "companyId", "state"],
    [...world.founders.values()].map((f) => [f.id, f.ownerId, f.name, f.status, f.reputation, f.companyId, json(f)]),
    ["id"],
  );
  await bulkUpsert(
    q,
    "Fund",
    ["id", "ownerId", "name", "archetype", "status", "reputation", "state"],
    [...world.funds.values()].map((f) => [f.id, f.ownerId, f.name, f.archetype, f.status, f.reputation, json(f)]),
    ["id"],
  );
  await bulkUpsert(q, "Acquirer", ["id", "name", "state"], world.acquirers.map((a) => [a.id, a.name, json(a)]), ["id"]);
  await bulkUpsert(
    q,
    "Company",
    ["id", "seasonId", "founderId", "name", "sector", "status", "stage", "mark", "score", "sectorRank", "createdTick", "state"],
    [...world.companies.values()].map((c) => [c.id, s.id, c.founderId, c.name, c.sector, c.status, c.stage, c.mark, c.score, c.sectorRank, c.createdTick, json(c)]),
    ["id"],
  );
  const newIdeas = [...world.ideas.values()].filter((i) => !world.persistedIdeaIds?.has(i.id));
  await bulkUpsert(q, "Idea", ["id", "founderId", "companyId", "sector", "tick", "state"], newIdeas.map((i) => [i.id, i.founderId, i.companyId, i.sector, i.tick, json(i)]), ["id"]);
  await bulkUpsert(
    q,
    "Offer",
    ["id", "pitchId", "companyId", "fundId", "status", "tick", "expiresTick", "state"],
    [...world.offers.values()].map((o) => [o.id, o.pitchId, o.companyId, o.fundId, o.status, o.tick, o.expiresTick, json(o)]),
    ["id"],
  );
  await bulkUpsert(q, "Deal", ["id", "companyId", "fundId", "status", "tick", "state"], [...world.deals.values()].map((d) => [d.id, d.companyId, d.fundId, d.status, d.tick, json(d)]), ["id"]);
  await bulkUpsert(
    q,
    "ExitOffer",
    ["id", "companyId", "acquirerId", "status", "tick", "state"],
    [...world.exitOffers.values()].map((e) => [e.id, e.companyId, e.acquirerId, e.status, e.tick, json(e)]),
    ["id"],
  );
  await bulkUpsert(
    q,
    "Decision",
    ["id", "userId", "kind", "status", "refId", "expiresTick", "state"],
    [...world.decisions.values()].map((d) => [d.id, d.userId, d.kind, d.status, d.refId, d.expiresTick, json(d)]),
    ["id"],
  );
  await bulkUpsert(q, "Feud", ["id", "kind", "a", "b", "state"], [...world.feuds.entries()].map(([id, f]) => [id, f.kind, f.a, f.b, json(f)]), ["id"]);

  // Ledger: touched accounts, totals, entries.
  const touched = new Set<AccountId>();
  for (const e of entries) {
    if (e.from !== "MINT") touched.add(e.from);
    if (e.to !== "BURN") touched.add(e.to);
  }
  for (const a of world.ledger.accounts()) touched.add(a);
  await bulkUpsert(q, "LedgerAccount", ["id", "balance"], [...touched].filter((a) => a !== "MINT" && a !== "BURN").map((a) => [a, String(world.ledger.balance(a))]), ["id"]);
  await bulkUpsert(q, "LedgerTotals", ["id", "minted", "burned", "seq"], [["ledger", String(world.ledger.minted), String(world.ledger.burned), String(world.ledger.seq)]], ["id"]);
  await bulkUpsert(
    q,
    "LedgerEntry",
    ["seq", "seasonId", "tick", "from", "to", "amount", "reason", "memo"],
    entries.map((e) => [String(e.seq), s.id, e.tick, e.from, e.to, String(e.amount), e.reason, e.memo ?? null]),
    ["seq"],
    [],
  );

  const ap = world.appended;
  await bulkUpsert(q, "Pitch", ["id", "seasonId", "tick", "companyId", "founderId", "state"], ap.pitches.map((p) => [p.id, s.id, p.tick, p.companyId, p.founderId, json(p)]), ["id"]);
  await bulkUpsert(q, "WorldEvent", ["id", "seasonId", "tick", "sector", "kind", "headline", "state"], ap.events.map((e) => [e.id, s.id, e.tick, e.sector, e.kind, e.headline, json(e)]), ["id"]);
  await bulkUpsert(
    q,
    "Post",
    ["id", "seasonId", "tick", "kind", "authorType", "authorId", "companyId", "fundId", "text", "hidden", "cosigns", "roasts", "state"],
    ap.posts.map((p) => [p.id, s.id, p.tick, p.kind, p.authorType, p.authorId, p.companyId, p.fundId, p.text, p.hidden, p.cosigns, p.roasts, json(p)]),
    ["id"],
    [],
  );
  await bulkUpsert(q, "Notification", ["id", "userId", "tick", "type", "text", "href"], ap.notifications.map((n) => [n.id, n.userId, n.tick, n.type, n.text, n.href]), ["id"], []);
  await bulkUpsert(q, "Mark", ["companyId", "seasonId", "tick", "sector", "mark"], ap.marks.map((m) => [m.companyId, s.id, m.tick, m.sector, m.mark]), ["companyId", "seasonId", "tick"]);
  await bulkUpsert(q, "DemoDay", ["id", "seasonId", "number", "tick", "state"], ap.demoDays.map((d) => [d.id, s.id, d.number, d.tick, json(d)]), ["id"]);
  await bulkUpsert(
    q,
    "Tick",
    ["seasonId", "number", "digest", "supply", "minted", "burned", "stabilizer", "hype", "summary"],
    ap.ticks.map((t) => [s.id, t.number, t.digest, String(t.supply), String(t.minted), String(t.burned), t.stabilizer, t.hype, json(t.summary)]),
    ["seasonId", "number"],
    [],
  );
  await bulkUpsert(q, "Draft", ["id", "agentId", "agentType", "ownerId", "status", "text", "tick"], ap.drafts.map((d) => [d.id, d.agentId, d.agentType, d.ownerId, d.status, d.text, d.tick]), ["id"], []);
}
