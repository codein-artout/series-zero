/**
 * The tick engine. One ordered pipeline per tick; deterministic given seed, config and inputs.
 * The ledger invariant is checked at the end of every tick and fails loudly.
 */
import type { GameConfig } from "@/config/game";
import { seasonCarry, seasonLearning } from "@/lib/rules/agents";
import { clamp } from "@/lib/rules/math";
import { seedCommitment } from "@/lib/rules/rng";
import { sha256Hex } from "@/lib/rules/hash";
import { decidePivot, pivotDefaultFor, stepCompanyStates, stepFundraising, stepPivots, stepRevenueAndBurn } from "./company";
import { dueDecisions, resolveDecisionsFor } from "./decisions";
import { stepDemoDay, isDemoDayTick } from "./demoday";
import { stepMeetings, stepReputation, takeMeeting } from "./funds";
import { stepMarket } from "./market";
import { stepOffers } from "./offers";
import { agentPost } from "./social";
import type { TickRecord, World } from "./types";
import { declineExit, judgeSeason, stepExits, stepValuation } from "./valuation";
import { seasonTickCount, treasuryAccount, walletAccount } from "./world";

export class InvariantError extends Error {}

export function stabilizerFor(w: World, cfg: GameConfig): number {
  const target = w.season.targetSupply || cfg.economy.targetSupply;
  if (!target) return 1;
  return clamp(1 - cfg.economy.stabilizerK * (w.ledger.supply() / target - 1), cfg.economy.stabilizerMin, cfg.economy.stabilizerMax);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Digest of the authoritative state after a tick (stored in the tick log). */
export function stateDigest(w: World): string {
  const body = {
    season: { n: w.season.number, tick: w.season.tick, hype: w.season.hype, ipo: w.season.ipoSlotsUsed, seq: w.season.idSeq },
    sectors: w.sectors.map((s) => [s.id, s.pool]),
    companies: [...w.companies.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((c) => [c.id, c.status, c.mark, c.headcount, c.debt, c.q, c.stage, c.capTable.map((x) => [x.holderId, x.share])]),
    funds: [...w.funds.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((f) => [f.id, f.sectorWeights, f.paidIn, f.distributions, f.reputation]),
    founders: [...w.founders.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((f) => [f.id, f.reputation, f.fraudCount, f.status]),
    ledger: w.ledger.snapshot(),
  };
  return sha256Hex(stable(body));
}

async function applyDueDecisionDefaults(w: World, cfg: GameConfig, tick: number): Promise<void> {
  for (const d of dueDecisions(w, tick)) {
    if (d.status !== "open") continue;
    if (d.kind === "pivot") {
      const choice = pivotDefaultFor(w, cfg, String(d.inputs.companyId));
      await decidePivot(w, cfg, d.refId, choice, "default", tick);
    } else if (d.kind === "exit") {
      const e = w.exitOffers.get(d.refId);
      if (e) declineExit(w, e, "default");
      else resolveDecisionsFor(w, d.refId, "void", "default", "Gone.");
    } else if (d.kind === "meeting") {
      await takeMeeting(w, cfg, d.refId, null, "default", tick);
    }
    // term_sheet defaults are applied when the offer lapses (stepOffers).
  }
}

/** Notification cap per user per day and batching of same-type items within a tick. */
function capNotifications(w: World, cfg: GameConfig, tick: number): void {
  const day = Math.floor((tick - 1) / cfg.ticks.perDay);
  const counts = w.season.notifCounts ?? {};
  const kept: typeof w.appended.notifications = [];
  const seen = new Map<string, number>();
  for (const n of w.appended.notifications.filter((x) => x.tick === tick)) {
    const key = `${n.userId}|${n.type}`;
    if (seen.has(key)) {
      const idx = seen.get(key)!;
      const prev = kept[idx];
      const m = prev.text.match(/ \(\+(\d+) more\)$/);
      const more = m ? Number(m[1]) + 1 : 1;
      prev.text = prev.text.replace(/ \(\+\d+ more\)$/, "") + ` (+${more} more)`;
      continue;
    }
    const c = counts[n.userId]?.day === day ? counts[n.userId] : { day, n: 0 };
    if (c.n >= cfg.notifications.maxPerDay) continue;
    c.n += 1;
    counts[n.userId] = c;
    seen.set(key, kept.length);
    kept.push(n);
  }
  w.season.notifCounts = counts;
  w.appended.notifications = [...w.appended.notifications.filter((x) => x.tick !== tick), ...kept];
}

export interface TickSummary extends TickRecord {
  pitches: number;
  deaths: number;
  crashed: string | null;
}

export async function runTick(w: World, cfg: GameConfig, opts: { nextSeed?: () => string } = {}): Promise<TickSummary> {
  if (w.season.status !== "running") throw new Error("season is not running");
  const tick = w.season.tick + 1;
  const total = seasonTickCount(cfg);
  if (tick > total) throw new Error(`season ${w.season.number} has ended at tick ${total}`);
  const stabilizer = stabilizerFor(w, cfg);
  const mintedBefore = w.ledger.minted;
  const burnedBefore = w.ledger.burned;

  const { crashed } = await stepMarket(w, cfg, tick);
  await applyDueDecisionDefaults(w, cfg, tick);
  await stepOffers(w, cfg, tick);
  stepRevenueAndBurn(w, cfg, tick, stabilizer);
  const deaths = await stepCompanyStates(w, cfg, tick);
  stepValuation(w, cfg, tick);
  await stepExits(w, cfg, tick);
  const pitches = await stepFundraising(w, cfg, tick);
  await stepPivots(w, cfg, tick);
  stepMeetings(w, cfg, tick);
  stepReputation(w, cfg, tick);
  if (isDemoDayTick(tick, cfg)) await stepDemoDay(w, cfg, tick);
  capNotifications(w, cfg, tick);

  const errs = w.ledger.check();
  if (errs.length) throw new InvariantError(`Ledger invariant failed at tick ${tick}: ${errs.join("; ")}`);

  w.season.tick = tick;
  const rec: TickSummary = {
    number: tick,
    digest: "",
    supply: w.ledger.supply(),
    minted: w.ledger.minted,
    burned: w.ledger.burned,
    stabilizer,
    hype: w.season.hype,
    summary: {
      pitches,
      deaths: deaths.length,
      mintedThisTick: w.ledger.minted - mintedBefore,
      burnedThisTick: w.ledger.burned - burnedBefore,
      liveCompanies: [...w.companies.values()].filter((c) => c.status === "alive" || c.status === "zombie").length,
    },
    pitches,
    deaths: deaths.length,
    crashed,
  };
  rec.digest = stateDigest(w);
  w.appended.ticks.push({ number: rec.number, digest: rec.digest, supply: rec.supply, minted: rec.minted, burned: rec.burned, stabilizer: rec.stabilizer, hype: rec.hype, summary: rec.summary });

  if (tick === total) await endSeason(w, cfg, tick, opts.nextSeed);
  return rec;
}

/** Season end: judge outcomes, reveal seed, reset wallets, carry reputation, start the next season. */
export async function endSeason(w: World, cfg: GameConfig, tick: number, nextSeed?: () => string): Promise<void> {
  await judgeSeason(w, cfg, tick);
  w.season.revealed = true;
  // Wallet reset: balances above the stipend are burned.
  for (const uid of w.wallets) {
    const acct = walletAccount(uid);
    const over = w.ledger.balance(acct) - cfg.economy.seasonStipend;
    if (over > 0) w.ledger.burn(tick, acct, over, "season_reset");
  }
  await agentPost(w, cfg, tick, {
    kind: "general",
    authorType: "system",
    authorId: null,
    authorName: "Floor Marshal",
    facts: {},
    companyId: null,
    fundId: null,
    refId: `${w.season.id}:end`,
    salience: 1,
    text: `Season ${w.season.number} is over. Outcomes are judged and the seed is revealed: every roll can now be recomputed.`,
  });
  w.ledger.assertInvariant("season end");
  if (!nextSeed) {
    w.season.status = "ended";
    return;
  }
  startNextSeason(w, cfg, tick, nextSeed());
}

export function startNextSeason(w: World, cfg: GameConfig, tick: number, seed: string): void {
  const prev = w.season;
  const credits = prev.prizeCredits ?? {};
  w.season = {
    ...prev,
    id: `season_${prev.number + 1}`,
    number: prev.number + 1,
    seed,
    commit: seedCommitment(seed),
    revealed: false,
    tick: 0,
    ipoSlotsUsed: 0,
    demoDaysHeld: 0,
    status: "running",
    shocks: [],
    checksBySector: {},
  };
  w.season.prizeCredits = {};
  for (const a of w.acquirers) w.ledger.mint(tick, treasuryAccount(a.id), cfg.npc.treasuryTopUp, "treasury_topup");
  for (const uid of w.wallets) {
    const acct = walletAccount(uid);
    const top = cfg.economy.seasonStipend - w.ledger.balance(acct);
    if (top > 0) w.ledger.mint(tick, acct, top, "stipend");
    if (credits[uid]) w.ledger.mint(tick, acct, credits[uid], "prize");
  }
  for (const f of w.founders.values()) {
    const c = f.companyId ? w.companies.get(f.companyId) : null;
    const good = c ? c.outcome === "unicorn" || c.outcome === "IPO" || c.outcome === "acquired" : false;
    f.stats = seasonLearning(f.stats, good, cfg);
    f.reputation = seasonCarry(f.reputation, 0, cfg);
    f.dnaEdits = 0;
  }
  for (const f of w.funds.values()) {
    f.reputation = seasonCarry(f.reputation, 0, cfg);
    f.thesisEdits = 0;
    f.startWeights = { ...f.sectorWeights };
  }
  w.ledger.assertInvariant("season start");
}
