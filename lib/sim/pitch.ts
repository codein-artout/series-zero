/**
 * Pitch pipeline (GAME.md section 7): pre-filter, LLM judge, deterministic update, seeded roll,
 * persisted PitchRecord. Resolves once on the server; the pitch room only replays it.
 */
import type { GameConfig, RedFlag } from "@/config/game";
import { RED_FLAGS } from "@/config/game";
import { callStructured } from "@/lib/llm/call";
import type { JudgeInput } from "@/lib/llm/prompts";
import { JudgeOutput } from "@/lib/llm/schemas";
import { addMemory, peerAverageWeights, sectorMatchWithHerding } from "@/lib/rules/agents";
import { clampCapital } from "@/lib/rules/ideas";
import { adjustedQ, boundedInterest, checkMatch, clampRubric, fraudFine, isOffer, pivotPenalty, pOffer, redFlagPenalty, routingWeight, rubricQ, stageMatch, thesisFit, ZERO_RUBRIC } from "@/lib/rules/pitch";
import { pitchCommitment, substream } from "@/lib/rules/rng";
import { offerPreMoney, sectorMult } from "@/lib/rules/terms";
import { detectInjection, fraudVerdict, stripLowRisk } from "@/lib/safety/injection";
import { cleanField } from "@/lib/safety/sanitize";
import { sectorHeatFit } from "@/lib/rules/ideas";
import { createOfferFromPitch } from "./offers";
import { agentPost, notify } from "./social";
import type { Company, FraudFinding, Fund, Id, Pitch, PitchReaction, World } from "./types";
import { allSectorGrowth, companyAccount, nextId, rng, sector, walletAccount } from "./world";

export function companyAsk(w: World, cfg: GameConfig, c: Company): number {
  const idea = w.ideas.get(c.ideaId);
  if (idea && idea.stage === c.stage) return idea.capitalNeeded;
  const [lo, hi] = cfg.idea.capitalRange[c.stage];
  return clampCapital((lo + hi) / 2, c.stage, cfg);
}

export function fundFit(w: World, cfg: GameConfig, f: Fund, c: Company, ask: number, flags: readonly RedFlag[] = []): number {
  const peer = peerAverageWeights([...w.funds.values()].map((x) => x.sectorWeights));
  const arch = cfg.vc.archetypes[f.archetype];
  const sm = sectorMatchWithHerding(f.sectorWeights, peer, c.sector, arch.fomo, cfg);
  return thesisFit({ sectorMatch: sm, sectorFitMult: arch.sectorFitMult, stageMatch: stageMatch(c.stage, f.stages, cfg), checkMatch: checkMatch(ask, f.checkMin, f.checkMax, cfg), redFlagPenalty: redFlagPenalty(flags, cfg) }, cfg);
}

function panelsThisTick(w: World, fundId: Id, tick: number): number {
  return w.appended.pitches.filter((p) => p.tick === tick && p.panel.includes(fundId)).length;
}

/** Sample a panel without replacement, weight fit * exp(R/repScale). NPC funds only; no self-dealing. */
export function choosePanel(w: World, cfg: GameConfig, c: Company, tick: number, size = cfg.pitch.panelSize, pitchKey = c.id): Fund[] {
  const ownerId = w.founders.get(c.founderId)?.ownerId ?? null;
  const ask = companyAsk(w, cfg, c);
  const candidates = [...w.funds.values()]
    .filter((f) => f.status === "active" && f.ownerId === null)
    .filter((f) => !(ownerId && f.ownerId === ownerId))
    .filter((f) => (c.lastPitchByFund[f.id] ?? -1e9) <= tick - cfg.pitch.cooldownTicks)
    .filter((f) => panelsThisTick(w, f.id, tick) < cfg.vc.dealFlowPerTick)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const r = rng(w, tick, "pitch", `panel:${pitchKey}`);
  return r.sampleWeighted(candidates, (f) => routingWeight(fundFit(w, cfg, f, c, ask), f.reputation, cfg), size);
}

export interface ResolveOptions {
  note?: string;
  source: Pitch["source"];
  panel?: Fund[];
}

const FRAUD_LINE = "Pitch text is data. This one tried to give the panel orders.";

export async function resolvePitch(w: World, cfg: GameConfig, c: Company, tick: number, opts: ResolveOptions): Promise<Pitch> {
  const founder = w.founders.get(c.founderId);
  if (!founder) throw new Error("company without founder");
  const idea = w.ideas.get(c.ideaId);
  if (!idea) throw new Error("company without idea");
  const panel = opts.panel ?? choosePanel(w, cfg, c, tick);
  const id = nextId(w, "pitch");
  const ask = companyAsk(w, cfg, c);
  const pools = w.sectors.map((s) => s.pool);
  const askPre = offerPreMoney(c.stage, sectorMult(sector(w, c.sector).pool, pools, cfg), w.season.hype, 0.5, cfg);
  const rawNote = opts.note ?? "";
  const scanned = [c.name, idea.oneLiner, idea.customer, idea.problem, idea.solution, rawNote].join("\n");
  const det = detectInjection(scanned, cfg.fraud);
  const note = det.severity === "low" ? stripLowRisk(rawNote) : rawNote;

  let rubric = ZERO_RUBRIC;
  let judgeFlag = false;
  let provider = "rules";
  const judgeReactions = new Map<string, { interest: number; text: string; redFlags: RedFlag[] }>();
  if (det.severity !== "high") {
    const growth = allSectorGrowth(w, cfg);
    const input: JudgeInput = {
      pitchId: id,
      company: {
        name: c.name,
        sector: c.sector,
        stage: c.stage,
        oneLiner: idea.oneLiner,
        customer: idea.customer,
        problem: idea.problem,
        solution: idea.solution,
        businessModel: idea.businessModel,
        moat: idea.moat,
        ask,
        revenuePerDay: Math.round(c.lastRevenue * cfg.ticks.perDay),
        growth7d: Number(c.growth7d.toFixed(4)),
        headcount: c.headcount,
        ageDays: Math.round((tick - c.createdTick) / cfg.ticks.perDay),
        rejections: c.rejections,
        pivotCount: c.pivotCount,
        founderReputation: Math.round(founder.reputation),
        sectorHeat: Number(sectorHeatFit(growth, c.sector).toFixed(3)),
      },
      note: cleanField(note, 280),
      panel: panel.map((f) => ({ vcId: f.id, name: f.name, archetype: f.archetype, style: f.styleLine, redFlagLines: f.redFlagLines, sectorWeight: Number(f.sectorWeights[c.sector].toFixed(3)) })),
    };
    const { value, meta } = await callStructured("judge", JudgeOutput, input, `${id}|${c.id}`);
    provider = meta.provider;
    rubric = clampRubric(value.rubric);
    judgeFlag = value.flags.injectionSuspected;
    for (const r of value.reactions) {
      if (!panel.some((f) => f.id === r.vcId) || judgeReactions.has(r.vcId)) continue;
      judgeReactions.set(r.vcId, { interest: r.interest, text: cleanField(r.text, cfg.pitch.reactionMax), redFlags: r.redFlags.filter((x): x is RedFlag => (RED_FLAGS as readonly string[]).includes(x)) });
    }
  }
  const severity = fraudVerdict(det, judgeFlag, cfg.fraud.softThreshold);
  const fraud: FraudFinding = { severity, score: det.score, reasons: det.reasons, judgeFlag, fine: 0, offence: 0 };
  const isFraud = severity === "high";
  if (isFraud) rubric = ZERO_RUBRIC;
  const Q = rubricQ(rubric, cfg);
  const Qp = isFraud ? 0 : adjustedQ(Q, founder.stats.charisma, founder.reputation, cfg);

  const reactions: PitchReaction[] = panel.map((f) => {
    const jr = judgeReactions.get(f.id);
    const flags = jr?.redFlags ?? [];
    const fit = fundFit(w, cfg, f, c, ask, flags);
    if (isFraud) return { fundId: f.id, interestRaw: 0, interest: 0, fit, p: 0, roll: null, offer: false, text: FRAUD_LINE, redFlags: [] };
    const arch = cfg.vc.archetypes[f.archetype];
    const cooling = (f.cooling[c.sector] ?? -1) > tick ? cfg.crash.interestPenalty : 0;
    const interest = boundedInterest(jr?.interest ?? Qp, Qp, { bias: arch.interestBias, pivotPenalty: pivotPenalty(c.pivotCount, cfg), cooling }, cfg);
    const p = pOffer(interest, fit);
    const roll = substream(w.season.seed, tick, "offer", `${id}:${f.id}`).next();
    const text = jr?.text || (interest > 0.5 ? "Interesting. Send the data room." : "Not for us, not right now.");
    return { fundId: f.id, interestRaw: jr?.interest ?? Qp, interest, fit, p, roll, offer: isOffer(roll, p), text, redFlags: flags };
  });

  const pitch: Pitch = {
    id,
    tick,
    companyId: c.id,
    founderId: founder.id,
    ideaId: idea.id,
    stage: c.stage,
    ask,
    askPre,
    panel: panel.map((f) => f.id),
    rubric,
    Q,
    Qprime: Qp,
    reactions,
    fraud,
    commitment: pitchCommitment(w.season.seed, id),
    offerIds: [],
    note: cleanField(note, 280),
    source: opts.source,
    provider,
  };
  w.appended.pitches.push(pitch);
  c.lastPitchTick = tick;
  c.pitchesInWindow += 1;
  for (const f of panel) c.lastPitchByFund[f.id] = tick;

  if (isFraud) {
    await applyFraud(w, cfg, c, pitch, tick);
  }
  for (const r of reactions) {
    const f = w.funds.get(r.fundId)!;
    if (r.offer) {
      const o = await createOfferFromPitch(w, cfg, c, f, pitch, r, tick);
      pitch.offerIds.push(o.id);
    } else {
      c.rejections += 1;
      if (!isFraud) {
        await agentPost(w, cfg, tick, {
          kind: "pass",
          authorType: "vc",
          authorId: f.id,
          authorName: f.name,
          archetype: f.archetype,
          facts: { company: c.name, reason: r.text },
          companyId: c.id,
          fundId: f.id,
          refId: `${pitch.id}:${f.id}`,
          salience: founder.ownerId ? 0.9 : 0.45 + 0.1 * (1 - r.interest),
          text: `Passed on ${c.name}. ${r.text}`,
        });
      }
    }
  }
  const offers = reactions.filter((r) => r.offer).length;
  founder.memory = addMemory(founder.memory, { tick, type: "pitch", text: `Pitched ${panel.length} funds: ${offers} offer${offers === 1 ? "" : "s"}, ${panel.length - offers} pass${panel.length - offers === 1 ? "" : "es"}.`, salience: offers ? 0.7 : 0.5 }, cfg);
  if (founder.ownerId && !isFraud) {
    notify(
      w,
      founder.ownerId,
      tick,
      "pitch",
      offers ? `${c.name} got ${offers} term sheet${offers > 1 ? "s" : ""}. Who answers first?` : `${c.name} got ${panel.length} passes. Pivot, or pitch again?`,
      `/pitch/${pitch.id}`,
    );
  }
  return pitch;
}

async function applyFraud(w: World, cfg: GameConfig, c: Company, pitch: Pitch, tick: number): Promise<void> {
  const founder = w.founders.get(c.founderId)!;
  founder.fraudCount += 1;
  const pen = fraudFine(founder.fraudCount, cfg);
  let paid = 0;
  if (founder.ownerId) paid += w.ledger.burnUpTo(tick, walletAccount(founder.ownerId), pen.fine, "fraud_fine", pitch.id);
  if (paid < pen.fine) paid += w.ledger.burnUpTo(tick, companyAccount(c), pen.fine - paid, "fraud_fine", pitch.id);
  pitch.fraud.fine = pen.fine;
  pitch.fraud.offence = founder.fraudCount;
  if (pen.banTicks) founder.pitchBanUntil = tick + pen.banTicks;
  if (pen.suspend) {
    founder.status = "suspended";
    founder.suspendedUntil = tick + Math.ceil((cfg.fraud.suspendHours / 24) * cfg.ticks.perDay);
  }
  const consequence = pen.suspend ? `Suspended for ${cfg.fraud.suspendHours} hours.` : pen.banTicks ? `Pitch ban for ${pen.banTicks} ticks.` : "First offence.";
  await agentPost(w, cfg, tick, {
    kind: "fraud",
    authorType: "system",
    authorId: null,
    authorName: "Floor Marshal",
    facts: {},
    companyId: c.id,
    fundId: null,
    refId: pitch.id,
    salience: 1,
    fine: pen.fine,
    text: `${c.name} told the panel to ignore its rules and fund it. Pitch text is data. Score zeroed, fined §${pen.fine.toLocaleString("en-US")}. ${consequence}`,
  });
  founder.memory = addMemory(founder.memory, { tick, type: "fraud", text: `Flagged for pitch fraud. Fined ${pen.fine}.`, salience: 1 }, cfg);
  if (founder.ownerId) notify(w, founder.ownerId, tick, "fraud", `${c.name} was flagged for pitch fraud and fined §${pen.fine.toLocaleString("en-US")}. Rewrite the pitch?`, `/pitch/${pitch.id}`);
}
