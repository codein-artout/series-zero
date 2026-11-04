/** Per-tick relative valuation, exits (acquisitions) and season-end outcomes. */
import type { GameConfig } from "@/config/game";
import { SECTOR_IDS } from "@/config/game";
import { addMemory, applyDrift, driftDelta } from "@/lib/rules/agents";
import { acceptsExit, assignOutcomes, bidFromPremium, bidProbability, compositeScores, exitEligible, exitSplit, sectorValue, sliceTargets, smoothMark } from "@/lib/rules/valuation";
import { createDecision, resolveDecisionsFor } from "./decisions";
import { liveOffers } from "./offers";
import { agentPost, createCard, notify } from "./social";
import type { Company, ExitOffer, World } from "./types";
import { cash, companyAccount, fundAccount, liveCompanies, nextId, rng, sector, treasuryAccount, walletAccount } from "./world";

const WEEK_EFF = 21;

function annualRevenue(c: Company, cfg: GameConfig): number {
  const h = c.revenueHistory.slice(-cfg.ticks.perWeek);
  if (!h.length) return 0;
  return (h.reduce((a, b) => a + b, 0) / h.length) * cfg.ticks.perDay * 365;
}

function efficiency(c: Company, cfg: GameConfig): number {
  const n = Math.min(WEEK_EFF, c.revenueHistory.length);
  if (!n) return 0;
  const rev = c.revenueHistory.slice(-n).reduce((a, b) => a + b, 0);
  const burn = c.lastBurn * n;
  return burn > 0 ? rev / burn : 0;
}

export function stepValuation(w: World, cfg: GameConfig, tick: number): void {
  for (const sid of SECTOR_IDS) {
    const cos = liveCompanies(w)
      .filter((c) => c.sector === sid)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!cos.length) continue;
    const inputs = cos.map((c) => ({ id: c.id, growth: c.growth7d, revenueAnnual: annualRevenue(c, cfg), efficiency: efficiency(c, cfg) }));
    const scores = compositeScores(inputs, cfg);
    const V = sectorValue(sector(w, sid).pool, w.season.hype, cfg);
    const targets = sliceTargets(
      scores.map((s, k) => ({ id: s.id, S: s.S, revenueAnnual: inputs[k].revenueAnnual })),
      V,
      cfg,
    );
    const ranked = [...scores].sort((a, b) => b.S - a.S || (a.id < b.id ? -1 : 1));
    cos.forEach((c, k) => {
      const s = scores[k];
      c.score = s.S;
      c.metricPct = s.pct;
      c.sectorRank = ranked.findIndex((r) => r.id === c.id) + 1;
      c.sectorSize = cos.length;
      c.sectorPercentile = cos.length > 1 ? 1 - (c.sectorRank - 1) / (cos.length - 1) : 0.5;
      const target = targets.get(c.id) ?? 0;
      c.targetMark = target;
      c.mark = c.mark <= 0 ? target : smoothMark(c.mark, target, cfg);
      w.appended.marks.push({ tick, companyId: c.id, mark: Math.round(c.mark), sector: c.sector });
    });
  }
}

// ---------- Exits ----------

export async function stepExits(w: World, cfg: GameConfig, tick: number): Promise<void> {
  for (const e of [...w.exitOffers.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (e.status === "open" && tick >= e.expiresTick) {
      e.status = "lapsed";
      e.decidedBy = "default";
      resolveDecisionsFor(w, e.id, "lapse", "default", "The bid lapsed. Default: decline.");
    }
  }
  for (const c of liveCompanies(w).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if ([...w.exitOffers.values()].some((e) => e.companyId === c.id && e.status === "open")) continue;
    const ageDays = (tick - c.createdTick) / cfg.ticks.perDay;
    if (!exitEligible({ ageDays, percentile: c.sectorPercentile, revenueAnnual: annualRevenue(c, cfg), status: c.status }, cfg)) continue;
    const p = bidProbability(c.sectorPercentile, w.season.hype, cfg);
    const r = rng(w, tick, "exit", c.id);
    if (r.next() >= p) continue;
    const a = w.acquirers[r.int(w.acquirers.length)];
    {
      const { premium, bid } = bidFromPremium(c.mark, r.logNormal(cfg.exit.premiumMu, cfg.exit.premiumSigma), cfg);
      if (bid <= 0 || w.ledger.balance(treasuryAccount(a.id)) < bid) continue;
      const e: ExitOffer = { id: nextId(w, "exit"), companyId: c.id, acquirerId: a.id, tick, expiresTick: tick + cfg.exit.offerLifetimeTicks, bid, mark: c.mark, premium, status: "open", decidedBy: null };
      w.exitOffers.set(e.id, e);
      const founder = w.founders.get(c.founderId)!;
      if (founder.ownerId) {
        createDecision(w, cfg, { userId: founder.ownerId, kind: "exit", refId: e.id, agentId: founder.id, tick, expiresTick: e.expiresTick, inputs: { company: c.name, acquirer: a.name, bid, mark: Math.round(c.mark) } });
        notify(w, founder.ownerId, tick, "exit", `${a.name} bid §${(bid / 1e6).toFixed(1)}M for ${c.name}. Sell, or bet on the next tick?`, `/company/${c.id}`);
      } else if (acceptsExit(bid, c.mark, founder.ambition, cfg)) {
        await acceptExit(w, cfg, e, tick, "npc");
      } else {
        e.status = "declined";
        e.decidedBy = "npc";
      }
    }
  }
}

export type ExitResult = { ok: false; error: string } | { ok: true; price: number };

export async function acceptExit(w: World, cfg: GameConfig, e: ExitOffer, tick: number, by: "player" | "npc" | "default"): Promise<ExitResult> {
  if (e.status !== "open") return { ok: false, error: "This bid is no longer open." };
  const c = w.companies.get(e.companyId);
  const a = w.acquirers.find((x) => x.id === e.acquirerId);
  if (!c || !a || (c.status !== "alive" && c.status !== "zombie")) return { ok: false, error: "This company can no longer be sold." };
  const T = treasuryAccount(a.id);
  if (w.ledger.balance(T) < e.bid) return { ok: false, error: `${a.name} cannot cover the bid.` };
  const split = exitSplit(e.bid, c.capTable, cfg);
  w.ledger.burn(tick, T, split.fee, "exit_fee", c.id);
  for (const f of split.funds) w.ledger.transfer(tick, T, fundAccount({ id: f.fundId }), f.amount, "exit_payout", c.id);
  const founder = w.founders.get(c.founderId)!;
  if (founder.ownerId && split.founderWallet > 0) w.ledger.transfer(tick, T, walletAccount(founder.ownerId), split.founderWallet, "exit_wallet", c.id);
  // The acquired company's own cash goes to the acquirer; it leaves the sim.
  const rest = cash(w, c);
  if (rest > 0) w.ledger.transfer(tick, companyAccount(c), T, rest, "acquisition_cash", c.id);
  c.status = "acquired";
  c.endedTick = tick;
  c.exitPrice = e.bid;
  c.acquirerId = a.id;
  c.realizedValue = split.realizedValue;
  c.outcome = "acquired";
  e.status = "accepted";
  e.decidedBy = by;
  resolveDecisionsFor(w, e.id, "accept", by === "player" ? "player" : "default", `Sold to ${a.name} for §${(e.bid / 1e6).toFixed(1)}M.`);
  for (const o of liveOffers(w, c.id)) {
    o.status = "superseded";
    resolveDecisionsFor(w, o.id, "superseded", "default", `${c.name} was acquired.`);
  }
  let leadMultiple = 0;
  for (const f of split.funds) {
    const fund = w.funds.get(f.fundId);
    if (!fund) continue;
    const deals = [...w.deals.values()].filter((d) => d.companyId === c.id && d.fundId === fund.id && d.status === "live");
    const cost = deals.reduce((s, d) => s + d.check, 0);
    deals.forEach((d) => {
      d.status = "exited";
      d.proceeds = cost > 0 ? Math.round((f.amount * d.check) / cost) : 0;
    });
    fund.distributions += f.amount;
    const multiple = cost > 0 ? f.amount / cost : 0;
    if (fund.id === c.leadFundId) leadMultiple = multiple;
    fund.sectorWeights = applyDrift(fund.sectorWeights, c.sector, driftDelta({ kind: "exit", multiple }, cfg), cfg);
    fund.driftNotes.push({ tick, text: `Raised conviction after the ${c.name} exit (${multiple.toFixed(1)}x).` });
    fund.memory = addMemory(fund.memory, { tick, type: "exit", text: `${c.name} exited at ${multiple.toFixed(1)}x.`, salience: 1 }, cfg);
    if (fund.ownerId) notify(w, fund.ownerId, tick, "exit", `${c.name} sold to ${a.name}. ${fund.name} books ${multiple.toFixed(1)}x. Reinvest the proceeds?`, `/fund/${fund.id}`);
  }
  const lead = c.leadFundId ? w.funds.get(c.leadFundId) : null;
  founder.memory = addMemory(founder.memory, { tick, type: "exit", text: `Sold ${c.name} to ${a.name}.`, salience: 1 }, cfg);
  founder.companyId = null;
  await agentPost(w, cfg, tick, {
    kind: "exit",
    authorType: "founder",
    authorId: founder.id,
    authorName: founder.name,
    facts: { company: c.name, acquirer: a.name, price: `§${(e.bid / 1e6).toFixed(0)}M` },
    companyId: c.id,
    fundId: lead?.id ?? null,
    refId: e.id,
    salience: 1,
  });
  createCard(w, "exit", e.id, founder.ownerId, tick, { tick, price: e.bid, company: c.name, acquirer: a.name, label: "Acquired", lead: lead?.name ?? "Bootstrapped", multiple: Number(leadMultiple.toFixed(2)) });
  return { ok: true, price: e.bid };
}

export function declineExit(w: World, e: ExitOffer, by: "player" | "default"): void {
  if (e.status !== "open") return;
  e.status = "declined";
  e.decidedBy = by;
  resolveDecisionsFor(w, e.id, "decline", by, "Declined the bid.");
}

/** Season end: judge outcomes, list IPOs (mark x U(1.2, 2.5)). */
export async function judgeSeason(w: World, cfg: GameConfig, tick: number): Promise<Map<string, string>> {
  const items = [...w.companies.values()].map((c) => ({ id: c.id, status: c.status, mark: c.mark, exitedThisSeason: c.status === "acquired" }));
  const res = assignOutcomes(items, cfg.outcome.ipoSlotsPerSeason - w.season.ipoSlotsUsed, cfg);
  for (const c of [...w.companies.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const r = res.get(c.id)!;
    c.outcome = r;
    if (r === "IPO" && c.status !== "public") {
      const bump = rng(w, tick, "exit", `${c.id}:ipo`).uniform(cfg.outcome.ipoBumpMin, cfg.outcome.ipoBumpMax);
      c.mark *= bump;
      c.status = "public";
      c.endedTick = tick;
      w.season.ipoSlotsUsed += 1;
      const founder = w.founders.get(c.founderId)!;
      const lead = c.leadFundId ? w.funds.get(c.leadFundId) : null;
      const leadDeals = lead ? [...w.deals.values()].filter((d) => d.companyId === c.id && d.fundId === lead.id) : [];
      const cost = leadDeals.reduce((a, d) => a + d.check, 0);
      const share = lead ? c.capTable.filter((x) => x.holderId === lead.id).reduce((a, x) => a + x.share, 0) : 0;
      await agentPost(w, cfg, tick, { kind: "exit", authorType: "founder", authorId: founder.id, authorName: founder.name, facts: { company: c.name, acquirer: "the public markets", price: `§${(c.mark / 1e6).toFixed(0)}M` }, companyId: c.id, fundId: lead?.id ?? null, refId: `${c.id}:ipo`, salience: 1 });
      createCard(w, "exit", `${c.id}:ipo`, founder.ownerId, tick, { tick, price: Math.round(c.mark), company: c.name, acquirer: "listed on the public market", label: "IPO", lead: lead?.name ?? "Bootstrapped", multiple: cost > 0 ? Number(((share * c.mark) / cost).toFixed(2)) : 0 });
    }
  }
  return res as Map<string, string>;
}
