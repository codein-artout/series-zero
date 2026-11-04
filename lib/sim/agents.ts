/**
 * Agent creation and idea generation. Rules decide every number; the LLM provider only writes
 * text fields and a bounded dnaFit. NPC DNA and theses are rule templates.
 */
import { AMBITIONS, ARCHETYPES, type Ambition, type Archetype, type GameConfig, type SectorId, type Stage, SECTOR_IDS } from "@/config/game";
import { callStructured } from "@/lib/llm/call";
import { IdeaOutput } from "@/lib/llm/schemas";
import type { IdeaInput } from "@/lib/llm/prompts";
import { drawHiddenStats, randomRedFlags, randomStages, randomThesisWeights, randomTraits, topMemories } from "@/lib/rules/agents";
import { clampCapital, clampDnaFit, ideaQuality, ideaText, novelty, sectorHeatFit } from "@/lib/rules/ideas";
import { sha256Hex } from "@/lib/rules/hash";
import { acquirerName, companyName, founderName, fundName } from "@/lib/rules/names";
import { cleanField } from "@/lib/safety/sanitize";
import { realNameHit } from "@/lib/safety/realnames";
import type { Acquirer, Company, FounderAgent, Fund, Idea, Traits, World } from "./types";
import { allSectorGrowth, companyAccount, fundAccount, nextId, rng, sector, sectorConfig, treasuryAccount } from "./world";

export function usedNames(w: World): Set<string> {
  const s = new Set<string>();
  for (const f of w.founders.values()) s.add(f.name);
  for (const f of w.funds.values()) s.add(f.name);
  for (const c of w.companies.values()) s.add(c.name);
  for (const a of w.acquirers) s.add(a.name);
  return s;
}

const BACKGROUND: Record<SectorId, string[]> = {
  ai_infra: ["Ran inference for a lab that no longer exists.", "Wrote the eval suite everyone copied and nobody credited."],
  climate: ["Agronomist turned drone pilot. Seven seasons on smallholder farms.", "Grid engineer who got tired of summer blackouts."],
  fintech: ["Ten years reconciling ledgers for small exporters.", "Former credit analyst. Knows why invoices wait."],
  health: ["Night-shift nurse who learned to code on breaks.", "Built clinic software in three countries."],
  devtools: ["Platform engineer. Has opinions about flaky tests.", "Maintained an open source tool used by strangers at scale."],
  consumer: ["Ran a market stall, then an app, then a market stall again.", "Community organiser with a growth spreadsheet."],
  space: ["Satellite ops for six years. Sleeps in UTC.", "Radar physicist who wants a customer, not a grant."],
};
const OBSESSION: Record<SectorId, string> = {
  ai_infra: "Models, agents, evals and the compute bill.",
  climate: "Water, soil, carbon and grids that hold.",
  fintech: "Payments, invoices and the cost of waiting for money.",
  health: "Patients who fall through the cracks between visits.",
  devtools: "Developers, deploys, tests and the API nobody documents.",
  consumer: "People, habits and the app they open on a Tuesday.",
  space: "Orbits, satellites and data nobody can see from the ground.",
};

export function npcDna(name: string, t: Traits, ambition: Ambition, affinity: SectorId, r: { pick: <T>(xs: readonly T[]) => T }): string {
  const ethics = t.ethics > 0.7 ? "Never sells customer data. Will lose a deal over it." : t.ethics < 0.35 ? "Rules are suggestions until a regulator calls." : "Plays fair, reads the fine print.";
  const risk = t.riskAppetite > 0.7 ? "High. Bets big, pivots late, then fast." : t.riskAppetite < 0.35 ? "Low. Profit first, no debt." : "Medium. Will take a risk with a plan.";
  const wont = ambition === "bootstrap" ? "Take a board seat offer. Hire before revenue." : ambition === "moonshot" ? "Settle for small. Build a lifestyle business." : "Burn out the team for a valuation.";
  return [`# ${name}`, "## Background", r.pick(BACKGROUND[affinity]), "## Obsessions", OBSESSION[affinity], "## Ethics", ethics, "## Risk appetite", risk, "## What I will not do", wont].join("\n");
}

export function createNpcFounder(
  w: World,
  cfg: GameConfig,
  tick: number,
  opts: { name?: string; ambition?: Ambition; affinity?: SectorId; ownerId?: string | null; traits?: Traits; dna?: string } = {},
): FounderAgent {
  const id = nextId(w, "fdr");
  const r = rng(w, tick, "stats", id);
  const name = opts.name ?? founderName(rng(w, tick, "names", id), usedNames(w));
  const traits = opts.traits ?? randomTraits(r);
  const ambition = opts.ambition ?? r.pick(AMBITIONS);
  const affinity = opts.affinity ?? r.pick(SECTOR_IDS);
  const dna = opts.dna ?? npcDna(name, traits, ambition, affinity, r);
  const f: FounderAgent = {
    id,
    name,
    ownerId: opts.ownerId ?? null,
    traits,
    ambition,
    stats: drawHiddenStats(r, cfg, dna),
    memory: [],
    reputation: cfg.reputation.start,
    status: "active",
    dna,
    dnaHash: sha256Hex(dna),
    dnaEdits: 0,
    dnaHistory: [{ tick, hash: sha256Hex(dna), chars: dna.length }],
    fraudCount: 0,
    pitchBanUntil: -1,
    suspendedUntil: -1,
    companyId: null,
    createdTick: tick,
  };
  w.founders.set(id, f);
  return f;
}

export interface GeneratedIdea {
  idea: Idea;
  name: string;
  slides: string[];
  provider: string;
}

export async function generateIdea(
  w: World,
  cfg: GameConfig,
  founder: FounderAgent,
  tick: number,
  opts: { stage: Stage; sectorHint?: SectorId; allowedSectors?: SectorId[]; pivotFrom?: Idea; source: Idea["source"] },
): Promise<GeneratedIdea> {
  const growth = allSectorGrowth(w, cfg);
  const used = usedNames(w);
  const news = w.recentEvents
    .slice(-30)
    .filter((e) => !opts.sectorHint || e.sector === opts.sectorHint)
    .slice(-cfg.idea.newsItems)
    .map((e) => ({ headline: e.headline, sector: e.sector, sentiment: e.sentiment }));
  const input: IdeaInput = {
    founderName: founder.name,
    dna: founder.dna,
    world: SECTOR_IDS.map((id) => ({ sector: id, name: sectorConfig(cfg, id).name, pool: Math.round(sector(w, id).pool), growth7d: Number(growth[id].toFixed(4)) })),
    hype: Math.round(w.season.hype),
    news,
    memory: topMemories(founder.memory, tick, cfg).map((m) => m.text),
    stage: opts.stage,
    capitalRange: cfg.idea.capitalRange[opts.stage] as [number, number],
    sectorHint: opts.sectorHint,
    allowedSectors: opts.allowedSectors,
    pivotFrom: opts.pivotFrom ? ideaText(opts.pivotFrom) : undefined,
    avoidNames: [...used].slice(0, 200),
  };
  const ideaId = nextId(w, "idea");
  const { value, meta } = await callStructured("idea", IdeaOutput, input, `${founder.id}|${tick}|${opts.source}|${ideaId}`);
  const sectorId = (opts.allowedSectors && !opts.allowedSectors.includes(value.sector) ? opts.allowedSectors[0] : value.sector) as SectorId;
  const oneLiner = cleanField(value.oneLiner, cfg.idea.oneLinerMax);
  const customer = cleanField(value.customer, cfg.idea.customerMax);
  const problem = cleanField(value.problem, cfg.idea.problemMax);
  const solution = cleanField(value.solution, cfg.idea.solutionMax);
  const existing = [...w.ideas.values()].filter((i) => i.founderId !== founder.id || i.id !== opts.pivotFrom?.id).map(ideaText);
  const nov = novelty(`${oneLiner} ${problem} ${solution} ${customer}`, existing, cfg);
  const z = rng(w, tick, "idea", ideaId).normal();
  const dnaFit = clampDnaFit(value.dnaFit, cfg);
  const q = ideaQuality({ heatFit: sectorHeatFit(growth, sectorId), dnaFit, novelty: nov.novelty, duplicate: nov.duplicate, noiseZ: z }, cfg);
  let name = cleanField(value.name, 40);
  if (!name || used.has(name) || realNameHit(name).hit) name = companyName(rng(w, tick, "names", ideaId), used);
  const idea: Idea = {
    id: ideaId,
    founderId: founder.id,
    companyId: null,
    sector: sectorId,
    oneLiner,
    customer,
    problem,
    solution,
    businessModel: value.businessModel,
    moat: value.moat,
    stage: opts.stage,
    capitalNeeded: clampCapital(value.capitalNeeded, opts.stage, cfg),
    q,
    dnaFit,
    novelty: nov.novelty,
    duplicate: nov.duplicate,
    tick,
    source: opts.source,
  };
  w.ideas.set(idea.id, idea);
  w.appended.ideas.push(idea);
  const slides = (value.slides ?? []).map((s) => cleanField(s, 40)).filter(Boolean).slice(0, 4);
  return { idea, name, slides: slides.length === 4 ? slides : ["The problem", "How it makes money", "Early signs", "The ask"], provider: meta.provider };
}

export function createCompany(w: World, cfg: GameConfig, founder: FounderAgent, idea: Idea, name: string, tick: number): Company {
  const id = nextId(w, "co");
  const c: Company = {
    id,
    name,
    founderId: founder.id,
    sector: idea.sector,
    ideaId: idea.id,
    stage: idea.stage,
    status: "alive",
    debt: 0,
    headcount: cfg.company.startHeadcount,
    marketingLevel: 1,
    priceTier: "standard",
    q: idea.q,
    execution: founder.stats.execution,
    teamSeed: founder.stats.teamSeed,
    traction: cfg.company.tractionStart,
    luckZ: 0,
    rejections: 0,
    raising: false,
    windowStartTick: -1,
    pitchesInWindow: 0,
    lastPitchTick: -999,
    lastPivotTick: -999,
    pivotCount: 0,
    revenueHistory: [],
    lastRevenue: 0,
    lastBurn: 0,
    growth7d: 0,
    growthRaw: 0,
    mark: 0,
    targetMark: 0,
    score: 0,
    sectorPercentile: 0.5,
    sectorRank: 0,
    sectorSize: 0,
    metricPct: { growth: 0.5, scale: 0.5, efficiency: 0.5 },
    zombieTicks: 0,
    recoverTicks: 0,
    graceLeft: -1,
    createdTick: tick,
    endedTick: null,
    capTable: [
      { holderType: "founder", holderId: founder.id, name: founder.name, share: cfg.company.founderShare },
      { holderType: "angels", holderId: null, name: "Angels", share: cfg.company.angelShare },
      { holderType: "pool", holderId: null, name: "Option pool", share: cfg.company.optionPoolShare },
    ],
    lastPitchByFund: {},
    revenueTotal: 0,
    burnTotal: 0,
    realizedValue: 0,
    exitPrice: null,
    acquirerId: null,
    leadFundId: null,
    rounds: 0,
    outcome: null,
  };
  idea.companyId = id;
  founder.companyId = id;
  w.companies.set(id, c);
  w.ledger.mint(tick, companyAccount(c), cfg.company.startingCash, "angel", c.name);
  return c;
}

export function createNpcFund(
  w: World,
  cfg: GameConfig,
  tick: number,
  opts: { archetype?: Archetype; name?: string; ownerId?: string | null; focus?: SectorId[]; size?: number } = {},
): Fund {
  const id = nextId(w, "fund");
  const r = rng(w, tick, "stats", id);
  const archetype = opts.archetype ?? r.pick(ARCHETYPES);
  const name = opts.name ?? fundName(rng(w, tick, "names", id), usedNames(w));
  const focus = opts.focus ?? r.shuffle(SECTOR_IDS).slice(0, 2 + r.int(2));
  const weights = randomThesisWeights(r, cfg, focus);
  const arch = cfg.vc.archetypes[archetype];
  const stages = randomStages(r);
  const size = opts.size ?? cfg.fund.size;
  const focusNames = focus.map((s) => sectorConfig(cfg, s).name).join(", ");
  const thesisText = [
    `We back ${stages.join(" to ")} companies in ${focusNames}.`,
    archetype === "skeptic" ? "Evidence first. Renewals over vision." : archetype === "hypeChaser" ? "We move fast where the noise is." : "We stay inside the thesis, even when it hurts.",
    `Checks from ${cfg.fund.checkMin.toLocaleString("en-US")} to ${cfg.fund.checkMax.toLocaleString("en-US")} scrip.`,
  ].join("\n");
  const f: Fund = {
    id,
    name,
    ownerId: opts.ownerId ?? null,
    archetype,
    traits: { riskAppetite: archetype === "hypeChaser" ? 0.75 : archetype === "skeptic" ? 0.3 : 0.5, ethics: 0.6, patience: arch.patience, ambition: 0.6 },
    thesisText,
    driftNotes: [],
    sectorWeights: weights,
    startWeights: { ...weights },
    stages,
    checkMin: cfg.fund.checkMin,
    checkMax: cfg.fund.checkMax,
    redFlags: randomRedFlags(r, archetype),
    redFlagLines: [],
    styleLine: arch.label,
    reputation: cfg.reputation.start,
    size,
    paidIn: 0,
    distributions: 0,
    thesisEdits: 0,
    cooling: {},
    memory: [],
    status: "active",
    createdTick: tick,
    pendingMeetings: [],
    bonusMeetings: 0,
    moicHistory: [],
  };
  w.funds.set(id, f);
  w.ledger.mint(tick, fundAccount(f), size, "genesis", f.name);
  return f;
}

export function createAcquirer(w: World, cfg: GameConfig, tick: number, name?: string): Acquirer {
  const id = nextId(w, "npc");
  const a: Acquirer = { id, name: name ?? acquirerName(rng(w, tick, "names", id), usedNames(w)) };
  w.acquirers.push(a);
  w.ledger.mint(tick, treasuryAccount(a.id), cfg.npc.treasury, "treasury", a.name);
  return a;
}
