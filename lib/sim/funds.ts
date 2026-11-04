/** VC simulation: positions, metrics, follow-ons, markups, meetings, reputation, leaderboards. */
import type { GameConfig } from "@/config/game";
import { addMemory, applyDrift, driftDelta, reputationStep } from "@/lib/rules/agents";
import { fundLeaderboard, hitRate, positionMultiple, proRataAmount, tvpi, vcTargets, type BoardRow, type Position } from "@/lib/rules/fund";
import { percentileRanks } from "@/lib/rules/math";
import { dilute } from "@/lib/rules/terms";
import { createDecision, openDecisions, resolveDecisionsFor } from "./decisions";
import { companyAsk, fundFit, resolvePitch } from "./pitch";
import { notify } from "./social";
import type { Company, Deal, Fund, Offer, World } from "./types";
import { companyAccount, dryPowder, fundAccount, liveCompanies, nextId } from "./world";

export function positionsOf(w: World, f: Fund): Position[] {
  const byCo = new Map<string, Deal[]>();
  for (const d of w.deals.values()) {
    if (d.fundId !== f.id) continue;
    const l = byCo.get(d.companyId) ?? [];
    l.push(d);
    byCo.set(d.companyId, l);
  }
  return [...byCo.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([companyId, deals]) => {
      const c = w.companies.get(companyId);
      const share = c ? c.capTable.filter((x) => x.holderType === "fund" && x.holderId === f.id).reduce((a, x) => a + x.share, 0) : 0;
      const status = deals.some((d) => d.status === "live") ? "live" : deals.some((d) => d.status === "exited") ? "exited" : "written_off";
      return { companyId, cost: deals.reduce((a, d) => a + d.check, 0), share, mark: c?.mark ?? 0, proceeds: deals.reduce((a, d) => a + d.proceeds, 0), status } as Position;
    });
}

export interface FundMetrics {
  tvpi: number;
  hits: number;
  total: number;
  hitRate: number;
  deployed: number;
  dryPowder: number;
  liveValue: number;
  best: { multiple: number; companyId: string | null };
  positions: Position[];
}

export function fundMetrics(w: World, cfg: GameConfig, f: Fund): FundMetrics {
  const positions = positionsOf(w, f);
  const hr = hitRate(positions, cfg);
  let best = { multiple: 0, companyId: null as string | null };
  for (const p of positions) {
    const m = positionMultiple(p);
    if (m > best.multiple) best = { multiple: m, companyId: p.companyId };
  }
  return {
    tvpi: tvpi(f.distributions, positions, f.paidIn),
    hits: hr.hits,
    total: hr.total,
    hitRate: hr.rate,
    deployed: f.paidIn,
    dryPowder: dryPowder(w, f),
    liveValue: positions.reduce((a, p) => a + (p.status === "live" ? p.share * p.mark : 0), 0),
    best,
    positions,
  };
}

export function fundBoard(w: World, cfg: GameConfig): Array<BoardRow & { fund: Fund }> {
  const rows = [...w.funds.values()].map((f) => {
    const m = fundMetrics(w, cfg, f);
    return { id: f.id, tvpi: m.tvpi, hitRate: m.hitRate, investments: m.total, fund: f };
  });
  return fundLeaderboard(rows, cfg).map((r) => ({ ...r, fund: w.funds.get(r.id)! }));
}

/**
 * After a round closes: existing holders mark up (thesis drift on the multiple) and pro-rata
 * holders with conviction follow on at the round price.
 */
export function afterRound(w: World, cfg: GameConfig, c: Company, o: Offer, tick: number): void {
  const holders = [...new Set([...w.deals.values()].filter((d) => d.companyId === c.id && d.status === "live" && d.fundId !== o.fundId).map((d) => d.fundId))].sort();
  for (const fid of holders) {
    const f = w.funds.get(fid);
    if (!f) continue;
    const deals = [...w.deals.values()].filter((d) => d.companyId === c.id && d.fundId === fid);
    const entryPost = deals[0]?.postMoney ?? o.postMoney;
    const multiple = o.preMoney / entryPost;
    if (multiple >= cfg.vc.drift.markupMinMultiple || multiple < 1) {
      f.sectorWeights = applyDrift(f.sectorWeights, c.sector, driftDelta({ kind: "markup", multiple }, cfg), cfg);
      f.driftNotes.push({ tick, text: `${c.name} repriced at ${multiple.toFixed(1)}x our entry.` });
    }
    const proRata = deals.some((d) => {
      const src = d.offerId ? w.offers.get(d.offerId) : undefined;
      return src ? src.proRata : true;
    });
    const share = c.capTable.filter((x) => x.holderType === "fund" && x.holderId === fid).reduce((a, x) => a + x.share, 0);
    const amount = proRataAmount(share, o.check, cfg.terms.checkRound);
    if (!proRata || amount < cfg.terms.checkRound || c.sectorPercentile < cfg.vc.followOnInterestMin || dryPowder(w, f) < amount) continue;
    w.ledger.transfer(tick, fundAccount(f), companyAccount(c), amount, "investment", `${o.id}:followon`);
    c.capTable = dilute(c.capTable, amount, o.postMoney, { id: f.id, name: f.name });
    const deal: Deal = { id: nextId(w, "deal"), offerId: null, companyId: c.id, fundId: f.id, tick, check: amount, preMoney: o.postMoney, postMoney: o.postMoney + amount, ownership: amount / (o.postMoney + amount), status: "live", proceeds: 0, lead: false, followOn: true };
    w.deals.set(deal.id, deal);
    f.paidIn += amount;
    f.memory = addMemory(f.memory, { tick, type: "followon", text: `Followed on in ${c.name} with ${amount}.`, salience: 0.6 }, cfg);
  }
}

// ---------- Player deal flow: take 1 of 3 meetings ----------

export function meetingCandidates(w: World, cfg: GameConfig, f: Fund, tick: number): Company[] {
  const all = liveCompanies(w)
    .filter((c) => {
      const owner = w.founders.get(c.founderId)?.ownerId ?? null;
      return !(owner && owner === f.ownerId);
    })
    .filter((c) => (c.lastPitchByFund[f.id] ?? -1e9) <= tick - cfg.pitch.cooldownTicks)
    .sort((a, b) => fundFit(w, cfg, f, b, companyAsk(w, cfg, b)) - fundFit(w, cfg, f, a, companyAsk(w, cfg, a)) || (a.id < b.id ? -1 : 1))
    .slice();
  const raising = all.filter((c) => c.raising || c.rounds === 0);
  // When nobody is actively raising, the deal flow falls back to any eligible company.
  return (raising.length ? raising : all).slice(0, cfg.vc.dealFlowPerTick);
}

export function stepMeetings(w: World, cfg: GameConfig, tick: number): void {
  for (const f of [...w.funds.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!f.ownerId || f.status !== "active") continue;
    if (openDecisions(w, f.ownerId).some((d) => d.kind === "meeting" && d.agentId === f.id)) continue;
    const cands = meetingCandidates(w, cfg, f, tick);
    if (!cands.length) continue;
    f.pendingMeetings = cands.map((c) => c.id);
    createDecision(w, cfg, { userId: f.ownerId, kind: "meeting", refId: `${f.id}:${tick}`, agentId: f.id, tick, expiresTick: tick + cfg.decision.windowTicks, inputs: { fund: f.name, companies: cands.map((c) => ({ id: c.id, name: c.name, sector: c.sector, ask: companyAsk(w, cfg, c) })) } });
    notify(w, f.ownerId, tick, "meeting", `${cands.length} founders want a meeting with ${f.name}. Which one gets the hour?`, `/fund/${f.id}`);
  }
}

/** The player's pick (or the default: top by fit) becomes a one-seat pitch. */
export async function takeMeeting(w: World, cfg: GameConfig, decisionRef: string, companyId: string | null, by: "player" | "default", tick: number): Promise<string> {
  const d = [...w.decisions.values()].find((x) => x.refId === decisionRef && x.kind === "meeting" && x.status === "open");
  if (!d) return "This meeting request is no longer open.";
  const f = w.funds.get(d.agentId);
  if (!f) return "Unknown fund.";
  const pick = companyId ?? f.pendingMeetings[0];
  if (!f.pendingMeetings.includes(pick)) return "That founder is not in your deal flow.";
  const c = w.companies.get(pick);
  if (!c || (c.status !== "alive" && c.status !== "zombie")) {
    resolveDecisionsFor(w, decisionRef, "void", by, "The company is gone.");
    return "The company is gone.";
  }
  const p = await resolvePitch(w, cfg, c, tick, { source: "player", panel: [f] });
  const r = p.reactions[0];
  resolveDecisionsFor(w, decisionRef, `meet:${c.id}`, by, r?.offer ? `Met ${c.name}. Term sheet out.` : `Met ${c.name}. Passed.`);
  f.pendingMeetings = [];
  return p.id;
}

// ---------- Reputation and history ----------

export function stepReputation(w: World, cfg: GameConfig, tick: number): void {
  if (tick % cfg.ticks.perDay !== 0) return;
  const rows = [...w.funds.values()].map((f) => {
    const m = fundMetrics(w, cfg, f);
    f.moicHistory.push({ tick, moic: Number(m.tvpi.toFixed(4)) });
    if (f.moicHistory.length > 120) f.moicHistory.splice(0, f.moicHistory.length - 120);
    return { id: f.id, tvpi: m.tvpi, hitRate: m.hitRate, investments: m.total };
  });
  const targets = vcTargets(rows);
  for (const f of w.funds.values()) f.reputation = reputationStep(f.reputation, targets.get(f.id) ?? 50, cfg);
  const live = liveCompanies(w);
  const pct = percentileRanks(live.map((c) => c.score));
  live.forEach((c, i) => {
    const founder = w.founders.get(c.founderId);
    if (founder) founder.reputation = reputationStep(founder.reputation, 100 * pct[i], cfg);
  });
}
