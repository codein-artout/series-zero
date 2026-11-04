/** Company simulation per tick: demand split, revenue, burn, runway, policy, death, zombies, pivots. */
import type { GameConfig, SectorId } from "@/config/game";
import { SECTOR_IDS } from "@/config/game";
import { addMemory, applyDrift, driftDelta } from "@/lib/rules/agents";
import {
  burnPerDay,
  graceStep,
  hiringDelta,
  luckFactor,
  luckStep,
  marketingLevel,
  pivotDefault,
  pivotHeadcount,
  pivotScore,
  poolPerTick,
  priceTier,
  productScore,
  rawGrowth7d,
  revenueSplit,
  runwayDays,
  shouldProposePivot,
  shouldStartRaising,
  smoothGrowth,
  teamQuality,
  tractionStep,
  zombieStep,
} from "@/lib/rules/company";
import { clamp } from "@/lib/rules/math";
import { generateIdea } from "./agents";
import { createDecision, resolveDecisionsFor } from "./decisions";
import { liveOffers } from "./offers";
import { resolvePitch } from "./pitch";
import { agentPost, notify } from "./social";
import type { Company, Idea, World } from "./types";
import { cash, companyAccount, fundAccount, liveCompanies, rng, sector } from "./world";

const REVENUE_KEEP = 48;

export function revenuePerDay(c: Company, cfg: GameConfig): number {
  const h = c.revenueHistory.slice(-cfg.ticks.perDay);
  if (!h.length) return 0;
  return (h.reduce((a, b) => a + b, 0) / h.length) * cfg.ticks.perDay;
}

export function companyRunway(w: World, cfg: GameConfig, c: Company): number {
  return runwayDays(cash(w, c) - c.debt, burnPerDay(c.headcount, c.marketingLevel, cfg), revenuePerDay(c, cfg));
}

/** Revenue and burn for every live company. Revenue is minted (NPC customers); burn goes to BURN. */
export function stepRevenueAndBurn(w: World, cfg: GameConfig, tick: number, stabilizer: number): void {
  for (const sid of SECTOR_IDS) {
    const cos = liveCompanies(w).filter((c) => c.sector === sid).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!cos.length) continue;
    const items = cos.map((c) => {
      c.luckZ = luckStep(c.luckZ, rng(w, tick, "luck", c.id).normal(), cfg);
      c.traction = tractionStep(c.traction, c.marketingLevel, cfg);
      const s = productScore({ q: c.q, execution: c.execution, team: teamQuality(c.teamSeed, c.headcount, cfg), marketingLevel: c.marketingLevel, luck: luckFactor(c.luckZ, cfg) }, cfg);
      return { s, tier: c.priceTier, traction: c.traction };
    });
    const revs = revenueSplit(poolPerTick(sector(w, sid).pool, stabilizer, cfg), items, cfg);
    cos.forEach((c, i) => {
      const rev = Math.round(revs[i]);
      w.ledger.mint(tick, companyAccount(c), rev, "revenue");
      c.lastRevenue = rev;
      c.revenueTotal += rev;
      c.revenueHistory.push(rev);
      if (c.revenueHistory.length > REVENUE_KEEP) c.revenueHistory.splice(0, c.revenueHistory.length - REVENUE_KEEP);
    });
  }
  for (const c of liveCompanies(w).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const burn = Math.round(burnPerDay(c.headcount, c.marketingLevel, cfg) / cfg.ticks.perDay);
    if (c.debt > 0) c.debt -= w.ledger.burnUpTo(tick, companyAccount(c), c.debt, "debt");
    const paid = w.ledger.burnUpTo(tick, companyAccount(c), burn, "opex");
    c.debt += burn - paid;
    c.lastBurn = burn;
    c.burnTotal += burn;
    const raw = rawGrowth7d(c.revenueHistory, cfg);
    c.growthRaw = raw;
    c.growth7d = smoothGrowth(c.growth7d, raw, cfg);
  }
}

/** Death, zombies and weekly policy. Returns companies that died this tick. */
export async function stepCompanyStates(w: World, cfg: GameConfig, tick: number): Promise<Company[]> {
  const deaths: Company[] = [];
  for (const c of liveCompanies(w).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const g = graceStep(c.debt, c.graceLeft, cfg);
    c.graceLeft = g.graceLeft;
    if (g.dead) {
      await killCompany(w, cfg, c, tick);
      deaths.push(c);
      continue;
    }
    const z = zombieStep({ growth: c.growth7d, cash: cash(w, c), zombieTicks: c.zombieTicks, recoverTicks: c.recoverTicks, isZombie: c.status === "zombie" }, cfg);
    if (z.isZombie && c.status === "alive") {
      c.status = "zombie";
      const f = w.founders.get(c.founderId);
      if (f?.ownerId) notify(w, f.ownerId, tick, "zombie", `${c.name} has been flat for ${Math.round(cfg.zombie.windowTicks / cfg.ticks.perDay)} days. Zombie, or pivot?`, `/company/${c.id}`);
    } else if (!z.isZombie && c.status === "zombie") c.status = "alive";
    c.zombieTicks = z.zombieTicks;
    c.recoverTicks = z.recoverTicks;

    const founder = w.founders.get(c.founderId)!;
    const runway = companyRunway(w, cfg, c);
    c.marketingLevel = marketingLevel(founder.traits.riskAppetite, runway, cfg);
    c.priceTier = priceTier(founder.traits, founder.ambition, cfg);
    const age = tick - c.createdTick;
    if (age > 0 && age % cfg.hiring.everyTicks === 0) {
      const d = hiringDelta({ runway, growth: c.growth7d, risk: founder.traits.riskAppetite, ambition: founder.ambition }, cfg);
      c.headcount = Math.max(cfg.hiring.minHeadcount, c.headcount + d);
    }
    if (founder.ownerId && Number.isFinite(runway) && runway < 14 && runway >= 13) {
      notify(w, founder.ownerId, tick, "runway", `${c.name} has under 14 days of runway. Raise, cut, or pivot?`, `/company/${c.id}`);
    }
  }
  return deaths;
}

/** Company dies: write off every position, wind-down cost from the lead, close open offers. */
export async function killCompany(w: World, cfg: GameConfig, c: Company, tick: number): Promise<void> {
  c.status = "dead";
  c.endedTick = tick;
  c.mark = 0;
  c.targetMark = 0;
  c.outcome = "dead";
  for (const o of liveOffers(w, c.id)) {
    o.status = "pulled";
    o.decidedTick = tick;
    resolveDecisionsFor(w, o.id, "pulled", "default", `${c.name} died before closing.`);
  }
  for (const e of w.exitOffers.values()) if (e.companyId === c.id && e.status === "open") e.status = "lapsed";
  for (const d of w.decisions.values()) if (d.agentId === c.founderId && d.status === "open") resolveDecisionsFor(w, d.refId, "void", "default", `${c.name} is dead.`);
  const lead = c.leadFundId ? w.funds.get(c.leadFundId) : null;
  for (const d of [...w.deals.values()].filter((x) => x.companyId === c.id && x.status === "live").sort((a, b) => (a.id < b.id ? -1 : 1))) {
    d.status = "written_off";
    const f = w.funds.get(d.fundId);
    if (!f) continue;
    f.sectorWeights = applyDrift(f.sectorWeights, c.sector, driftDelta({ kind: "writeoff" }, cfg), cfg);
    f.driftNotes.push({ tick, text: `Wrote off ${c.name}. ${sectorName(cfg, c.sector)} weight cut.` });
    f.memory = addMemory(f.memory, { tick, type: "writeoff", text: `Wrote off ${c.name}.`, salience: 0.8 }, cfg);
    if (f.ownerId) notify(w, f.ownerId, tick, "writeoff", `${c.name} is dead. ${f.name} wrote it off. Double down elsewhere?`, `/fund/${f.id}`);
  }
  if (lead) {
    const leadCheck = [...w.deals.values()].filter((d) => d.companyId === c.id && d.fundId === lead.id).reduce((a, d) => a + d.check, 0);
    w.ledger.burnUpTo(tick, fundAccount(lead), Math.round(leadCheck * cfg.failure.windDownRate), "wind_down", c.id);
  }
  const founder = w.founders.get(c.founderId)!;
  founder.memory = addMemory(founder.memory, { tick, type: "death", text: `${c.name} ran out of runway.`, salience: 1 }, cfg);
  founder.companyId = null;
  await agentPost(w, cfg, tick, {
    kind: "death",
    authorType: "founder",
    authorId: founder.id,
    authorName: founder.name,
    facts: { company: c.name, fund: lead?.name ?? "Nobody" },
    companyId: c.id,
    fundId: lead?.id ?? null,
    refId: `${c.id}:death`,
    salience: 0.8,
  });
  if (founder.ownerId) notify(w, founder.ownerId, tick, "death", `${c.name} is dead. Cash hit zero and the grace period ended. Start again?`, `/company/${c.id}`);
}

function sectorName(cfg: GameConfig, id: SectorId): string {
  return cfg.sectors.find((s) => s.id === id)?.name ?? id;
}

// ---------- Fundraising ----------

export async function stepFundraising(w: World, cfg: GameConfig, tick: number): Promise<number> {
  let pitches = 0;
  for (const c of liveCompanies(w).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const founder = w.founders.get(c.founderId)!;
    if (founder.status === "suspended") {
      if (founder.suspendedUntil <= tick) founder.status = "active";
      else continue;
    }
    if (founder.pitchBanUntil > tick) continue;
    if (liveOffers(w, c.id).length) continue;
    const runway = companyRunway(w, cfg, c);
    if (!c.raising) {
      const cooledDown = c.windowStartTick < 0 || tick - c.lastPitchTick >= cfg.fundraise.windowCooldownTicks;
      if (cooledDown && tick - c.createdTick >= 1 && shouldStartRaising({ runway, ambition: founder.ambition, roundsAtStage: c.rounds > 0 && tick - c.createdTick < 63 }, cfg)) {
        c.raising = true;
        c.windowStartTick = tick;
        c.pitchesInWindow = 0;
        c.rejections = 0;
      } else continue;
    }
    if (c.pitchesInWindow >= cfg.fundraise.maxPitches) {
      c.raising = false;
      continue;
    }
    if (tick - c.lastPitchTick < cfg.fundraise.pitchEveryTicks) continue;
    const p = await resolvePitch(w, cfg, c, tick, { source: founder.ownerId ? "player" : "npc" });
    if (p.panel.length) pitches++;
  }
  return pitches;
}

// ---------- Pivots ----------

export async function stepPivots(w: World, cfg: GameConfig, tick: number): Promise<void> {
  for (const c of liveCompanies(w).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const founder = w.founders.get(c.founderId)!;
    if ([...w.decisions.values()].some((d) => d.kind === "pivot" && d.agentId === founder.id && d.status === "open")) continue;
    const runway = companyRunway(w, cfg, c);
    const score = pivotScore({ rejections: c.rejections, sectorPercentile: c.sectorPercentile, peers: c.sectorSize - 1, runway }, cfg);
    if (!shouldProposePivot({ score, ambition: founder.ambition, runway, tick, lastPivotTick: c.lastPivotTick }, cfg)) continue;
    const old = w.ideas.get(c.ideaId)!;
    const allowed = [c.sector, ...(cfg.sectorAdjacency[c.sector] as SectorId[])];
    const g = await generateIdea(w, cfg, founder, tick, { stage: c.stage, allowedSectors: allowed, pivotFrom: old, source: "pivot" });
    c.lastPivotTick = tick;
    await agentPost(w, cfg, tick, {
      kind: "pivot",
      authorType: "founder",
      authorId: founder.id,
      authorName: founder.name,
      facts: { company: c.name, idea: g.idea.oneLiner.replace(/\.$/, "").toLowerCase() },
      companyId: c.id,
      fundId: null,
      refId: `${g.idea.id}:rumor`,
      salience: 0.55,
    });
    if (founder.ownerId) {
      createDecision(w, cfg, {
        userId: founder.ownerId,
        kind: "pivot",
        refId: g.idea.id,
        agentId: founder.id,
        tick,
        expiresTick: tick + cfg.decision.windowTicks,
        inputs: { companyId: c.id, company: c.name, idea: g.idea.oneLiner, sector: g.idea.sector, score: Number(score.toFixed(2)), runway: Number.isFinite(runway) ? Math.round(runway) : null, rejections: c.rejections },
      });
      notify(w, founder.ownerId, tick, "pivot", `${c.name} wants to pivot to "${g.idea.oneLiner.replace(/\.$/, "")}". Approve or veto?`, `/company/${c.id}`);
    } else {
      await applyPivot(w, cfg, c, g.idea, tick);
    }
  }
}

export async function applyPivot(w: World, cfg: GameConfig, c: Company, idea: Idea, tick: number): Promise<void> {
  const founder = w.founders.get(c.founderId)!;
  c.traction *= cfg.pivot.tractionMult;
  const hc = pivotHeadcount(c.headcount, c.marketingLevel, cfg);
  c.headcount = hc.headcount;
  c.marketingLevel = hc.marketing;
  c.execution = clamp(c.execution - cfg.stats.pivotExecutionHit, 0.05, 1);
  founder.stats.execution = clamp(founder.stats.execution - cfg.stats.pivotExecutionHit, cfg.stats.min - cfg.stats.pivotExecutionHit * 4, cfg.stats.max);
  c.q = idea.q;
  c.ideaId = idea.id;
  c.sector = idea.sector;
  idea.companyId = c.id;
  c.pivotCount += 1;
  c.lastPivotTick = tick;
  c.rejections = 0;
  c.raising = false;
  c.zombieTicks = 0;
  founder.memory = addMemory(founder.memory, { tick, type: "pivot", text: `Pivoted ${c.name} to: ${idea.oneLiner}`, salience: 0.9 }, cfg);
}

/** Player choice or default on a pivot decision. */
export async function decidePivot(w: World, cfg: GameConfig, ideaId: string, choice: "approve" | "veto", by: "player" | "default", tick: number): Promise<string> {
  const d = [...w.decisions.values()].find((x) => x.refId === ideaId && x.kind === "pivot" && x.status === "open");
  const idea = w.ideas.get(ideaId);
  const c = idea && d ? w.companies.get(String(d.inputs.companyId)) : undefined;
  if (!d || !idea || !c || (c.status !== "alive" && c.status !== "zombie")) return "This pivot is no longer open.";
  if (choice === "approve") {
    await applyPivot(w, cfg, c, idea, tick);
    resolveDecisionsFor(w, ideaId, "approve", by, `Pivoted to ${idea.oneLiner}. Burn cut by a third, traction down 30%.`);
    return "Approved.";
  }
  resolveDecisionsFor(w, ideaId, "veto", by, "Vetoed. Same idea, same burn.");
  return "Vetoed.";
}

export function pivotDefaultFor(w: World, cfg: GameConfig, companyId: string): "approve" | "veto" {
  const c = w.companies.get(companyId);
  if (!c) return "veto";
  return pivotDefault(companyRunway(w, cfg, c), cfg);
}
