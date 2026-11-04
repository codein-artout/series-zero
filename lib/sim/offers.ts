/** Offers, counters, acceptance and closing (GAME.md section 10). */
import type { GameConfig, Stage } from "@/config/game";
import { STAGES } from "@/config/game";
import { addMemory } from "@/lib/rules/agents";
import { substream } from "@/lib/rules/rng";
import { buildTerms, competitionDecay, counterAcceptance, dilute, finishTerms, rankOffers, resolveCounter, sectorMult, startingPatience } from "@/lib/rules/terms";
import { createDecision, resolveDecisionsFor } from "./decisions";
import { agentPost, createCard, notify } from "./social";
import type { Company, Deal, Fund, Offer, Pitch, PitchReaction, World } from "./types";
import { companyAccount, dryPowder, fundAccount, nextId, sector } from "./world";
import { bumpFeud } from "./feuds";

export async function createOfferFromPitch(w: World, cfg: GameConfig, c: Company, f: Fund, pitch: Pitch, r: PitchReaction, tick: number): Promise<Offer> {
  const id = nextId(w, "offer");
  const pools = w.sectors.map((s) => s.pool);
  const terms = buildTerms(
    { ask: pitch.ask, interest: r.interest, stage: c.stage, sMult: sectorMult(sector(w, c.sector).pool, pools, cfg), H: w.season.hype, checkMin: f.checkMin, checkMax: Math.min(f.checkMax, Math.max(f.checkMin, dryPowder(w, f))) },
    cfg,
  );
  const u = substream(w.season.seed, tick, "offer", `${id}:patience`).next();
  const o: Offer = {
    id,
    pitchId: pitch.id,
    companyId: c.id,
    fundId: f.id,
    tick,
    expiresTick: tick + cfg.offer.lifetimeTicks,
    exclusiveUntil: tick + cfg.offer.exclusivityTicks,
    status: "open",
    ...terms,
    interest: r.interest,
    patience: startingPatience(cfg.vc.archetypes[f.archetype].patience, u, cfg),
    counters: [],
    decidedBy: null,
    decidedTick: null,
    note: r.text,
  };
  w.offers.set(id, o);
  const founder = w.founders.get(c.founderId);
  if (founder?.ownerId) {
    createDecision(w, cfg, { userId: founder.ownerId, kind: "term_sheet", refId: o.id, agentId: founder.id, tick, expiresTick: o.expiresTick, inputs: { check: o.check, preMoney: o.preMoney, fund: f.name, company: c.name } });
    notify(w, founder.ownerId, tick, "term_sheet", `Your founder got a term sheet. ${f.name} wants an answer in ${cfg.offer.lifetimeTicks} ticks.`, `/offers/${o.id}`);
  }
  for (const other of w.offers.values()) {
    if (other.companyId === c.id && other.status === "open" && other.fundId !== f.id) bumpFeud(w, "funds", f.id, other.fundId, null);
  }
  await agentPost(w, cfg, tick, {
    kind: "term_sheet",
    authorType: "vc",
    authorId: f.id,
    authorName: f.name,
    archetype: f.archetype,
    facts: { company: c.name, check: `§${(o.check / 1e6).toFixed(1)}M`, pre: `§${(o.preMoney / 1e6).toFixed(1)}M`, ticks: cfg.offer.lifetimeTicks },
    companyId: c.id,
    fundId: f.id,
    refId: o.id,
    salience: 0.65,
  });
  return o;
}

export function liveOffers(w: World, companyId: string): Offer[] {
  return [...w.offers.values()].filter((o) => o.companyId === companyId && o.status === "open").sort((a, b) => (a.id < b.id ? -1 : 1));
}

export type CounterResult = { ok: false; error: string } | { ok: true; accepted: boolean; pulled: boolean; A: number; roll: number; patience: number };

export async function counterOffer(w: World, cfg: GameConfig, o: Offer, counterCheck: number, counterPre: number, tick: number, by: "player" | "npc"): Promise<CounterResult> {
  if (o.status !== "open") return { ok: false, error: "This offer is no longer open." };
  if (o.counters.length >= cfg.negotiation.maxCounters) return { ok: false, error: `You have used all ${cfg.negotiation.maxCounters} counters on this offer.` };
  if (!Number.isInteger(counterCheck) || !Number.isInteger(counterPre) || counterCheck <= 0 || counterPre <= 0) return { ok: false, error: "Counter amounts must be positive whole scrip." };
  const f = w.funds.get(o.fundId)!;
  if (counterCheck > dryPowder(w, f)) return { ok: false, error: `${f.name} does not have that much dry powder.` };
  const n = o.counters.length + 1;
  const A = counterAcceptance({ offerPre: o.preMoney, offerCheck: o.check, counterPre, counterCheck, patience: o.patience }, cfg);
  const roll = substream(w.season.seed, tick, "counter", `${o.id}:${n}`).next();
  const out = resolveCounter(A, roll, o.patience, cfg);
  o.counters.push({ n, check: counterCheck, preMoney: counterPre, A, roll, accepted: out.accepted, tick });
  o.patience = out.patience;
  const c = w.companies.get(o.companyId)!;
  if (out.accepted) {
    const t = finishTerms(counterCheck, counterPre, o.interest, cfg);
    Object.assign(o, t);
    o.note = `Counter ${n} accepted. ${o.note}`;
  } else if (out.pulled) {
    o.status = "pulled";
    o.decidedBy = by;
    o.decidedTick = tick;
    resolveDecisionsFor(w, o.id, "pulled", by === "npc" ? "default" : by, `${f.name} pulled the offer after counter ${n}.`);
    await agentPost(w, cfg, tick, { kind: "pass", authorType: "vc", authorId: f.id, authorName: f.name, archetype: f.archetype, facts: { company: c.name, reason: "Countered one time too many." }, companyId: c.id, fundId: f.id, refId: `${o.id}:pulled`, salience: 0.6, text: `Pulled our offer to ${c.name}. Countered one time too many.` });
  }
  return { ok: true, accepted: out.accepted, pulled: !out.accepted && out.pulled, A, roll, patience: o.patience };
}

function nextStage(s: Stage): Stage {
  const i = STAGES.indexOf(s);
  return STAGES[Math.min(STAGES.length - 1, i + 1)];
}

export type AcceptResult = { ok: false; error: string } | { ok: true; deal: Deal };

export async function acceptOffer(w: World, cfg: GameConfig, o: Offer, tick: number, by: "player" | "npc" | "default"): Promise<AcceptResult> {
  if (o.status !== "open") return { ok: false, error: "This offer is no longer open." };
  const c = w.companies.get(o.companyId);
  const f = w.funds.get(o.fundId);
  if (!c || !f) return { ok: false, error: "Unknown offer." };
  if (c.status !== "alive" && c.status !== "zombie") return { ok: false, error: `${c.name} can no longer raise.` };
  if (dryPowder(w, f) < o.check) {
    o.status = "pulled";
    return { ok: false, error: `${f.name} ran out of dry powder and pulled the offer.` };
  }
  w.ledger.transfer(tick, fundAccount(f), companyAccount(c), o.check, "investment", o.id);
  if (c.debt > 0) c.debt -= w.ledger.burnUpTo(tick, companyAccount(c), c.debt, "debt", o.id);
  w.ledger.burnUpTo(tick, companyAccount(c), Math.round(o.check * cfg.fees.closeRate), "close_fee", o.id);
  const ownershipBefore = c.capTable.filter((x) => x.holderType === "founder").reduce((a, x) => a + x.share, 0);
  c.capTable = dilute(c.capTable, o.check, o.preMoney, { id: f.id, name: f.name });
  const deal: Deal = {
    id: nextId(w, "deal"),
    offerId: o.id,
    companyId: c.id,
    fundId: f.id,
    tick,
    check: o.check,
    preMoney: o.preMoney,
    postMoney: o.postMoney,
    ownership: o.ownership,
    status: "live",
    proceeds: 0,
    lead: !c.leadFundId,
    followOn: [...w.deals.values()].some((d) => d.companyId === c.id && d.fundId === f.id),
  };
  w.deals.set(deal.id, deal);
  f.paidIn += o.check;
  w.season.checksBySector[c.sector] = (w.season.checksBySector[c.sector] ?? 0) + 1;
  if (!c.leadFundId) c.leadFundId = f.id;
  c.rounds += 1;
  c.stage = nextStage(c.stage);
  c.raising = false;
  c.rejections = 0;
  c.pitchesInWindow = 0;
  c.windowStartTick = -1;
  if (c.mark < o.postMoney * 0.5) c.mark = Math.max(c.mark, o.postMoney * 0.5);
  o.status = "accepted";
  o.decidedBy = by === "default" ? "default" : by;
  o.decidedTick = tick;
  resolveDecisionsFor(w, o.id, "accept", by === "npc" ? "default" : by, `Closed ${f.name}'s ${(o.check / 1e6).toFixed(1)}M at ${(o.preMoney / 1e6).toFixed(1)}M pre.`);
  for (const other of liveOffers(w, c.id)) {
    other.status = "superseded";
    other.decidedTick = tick;
    bumpFeud(w, "funds", f.id, other.fundId, f.id);
    resolveDecisionsFor(w, other.id, "superseded", "default", `${c.name} took ${f.name}'s offer instead.`);
  }
  const founder = w.founders.get(c.founderId)!;
  founder.memory = addMemory(founder.memory, { tick, type: "funded", text: `Raised ${o.check} from ${f.name} at ${o.preMoney} pre.`, salience: 0.9 }, cfg);
  f.memory = addMemory(f.memory, { tick, type: "invested", text: `Invested ${o.check} in ${c.name}.`, salience: 0.7 }, cfg);
  await agentPost(w, cfg, tick, {
    kind: "funded",
    authorType: "founder",
    authorId: founder.id,
    authorName: founder.name,
    facts: { company: c.name, fund: f.name, check: `§${(o.check / 1e6).toFixed(1)}M` },
    companyId: c.id,
    fundId: f.id,
    refId: deal.id,
    salience: founder.ownerId ? 0.95 : 0.55,
  });
  createCard(w, "term_sheet", o.id, founder.ownerId, tick, {
    season: w.season.number,
    investor: f.name,
    company: c.name,
    preMoney: o.preMoney,
    check: o.check,
    ownership: o.ownership,
    liqPref: o.liqPref,
    board: o.board === "seat" ? "1 board seat" : "1 observer",
    signature: founder.name,
    founderShareBefore: ownershipBefore,
  });
  if (f.ownerId) notify(w, f.ownerId, tick, "deal", `${f.name} closed ${c.name}. Will it mark up or write down?`, `/fund/${f.id}`);
  return { ok: true, deal };
}

export function declineOffer(w: World, cfg: GameConfig, o: Offer, tick: number, by: "player" | "default" | "npc"): void {
  if (o.status !== "open") return;
  o.status = "declined";
  o.decidedBy = by;
  o.decidedTick = tick;
  resolveDecisionsFor(w, o.id, "decline", by === "npc" ? "default" : by, "Declined.");
}

/** Per tick: competition decay, expiry, NPC founder choices. */
export async function stepOffers(w: World, cfg: GameConfig, tick: number): Promise<void> {
  const byCompany = new Map<string, Offer[]>();
  for (const o of [...w.offers.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (o.status !== "open") continue;
    const list = byCompany.get(o.companyId) ?? [];
    list.push(o);
    byCompany.set(o.companyId, list);
  }
  for (const [companyId, offers] of byCompany) {
    const c = w.companies.get(companyId)!;
    for (const o of offers) {
      o.patience = competitionDecay(o.patience, offers.length - 1, cfg);
      if (o.patience < cfg.negotiation.pullBelow && offers.length > 1) {
        o.status = "pulled";
        o.decidedTick = tick;
        resolveDecisionsFor(w, o.id, "pulled", "default", "The fund lost patience with the competition.");
      } else if (tick >= o.expiresTick) {
        o.status = "lapsed";
        o.decidedBy = "default";
        o.decidedTick = tick;
        resolveDecisionsFor(w, o.id, "lapse", "default", "The offer lapsed. Default: decline.");
      }
    }
    const founder = w.founders.get(c.founderId);
    const open = offers.filter((o) => o.status === "open");
    if (!founder || founder.ownerId || open.length === 0) continue;
    // NPC founder: wait one tick for competing offers, then take the best (moonshots counter once).
    if (open.every((o) => o.tick === tick)) continue;
    const best = rankOffers(open, founder.ambition === "bootstrap")[0];
    const ratio = cfg.negotiation.npcCounterRatio[founder.ambition];
    if (ratio > 1 && best.counters.length === 0) {
      const res = await counterOffer(w, cfg, best, best.check, Math.round((best.preMoney * ratio) / 10_000) * 10_000, tick, "npc");
      if (res.ok && !res.accepted) continue;
    }
    if (best.status === "open") await acceptOffer(w, cfg, best, tick, "npc");
  }
}
