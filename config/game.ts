/**
 * Every tunable from design/GAME.md. Nothing in lib/rules or lib/sim may hardcode a game number.
 * Validated with zod (schema derived from these defaults plus refinements). Override with a JSON
 * file named in GAME_CONFIG_PATH (deep-merged) via config/load.ts.
 */
import { z } from "zod";

export const SECTOR_IDS = ["ai_infra", "climate", "fintech", "health", "devtools", "consumer", "space"] as const;
export type SectorId = (typeof SECTOR_IDS)[number];
export const STAGES = ["preseed", "seed", "seriesA"] as const;
export type Stage = (typeof STAGES)[number];
export const AMBITIONS = ["bootstrap", "lifestyle", "moonshot"] as const;
export type Ambition = (typeof AMBITIONS)[number];
export const ARCHETYPES = ["hypeChaser", "skeptic", "thesisDriven"] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const PRICE_TIERS = ["discount", "standard", "premium"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];
export const RNG_DOMAINS = ["pitch", "offer", "counter", "idea", "luck", "event", "hype", "exit", "gossip", "hiring", "stats", "names", "odds", "season", "crash"] as const;
export type RngDomain = (typeof RNG_DOMAINS)[number];
export const RED_FLAGS = ["no_traction", "no_revenue_path", "crowded_market", "hardware_at_seed", "regulatory_risk", "thin_moat", "team_gap", "burn_heavy", "unclear_customer", "template_pitch"] as const;
export type RedFlag = (typeof RED_FLAGS)[number];

export const defaultGameConfig = {
  meta: { title: "Series Zero", currencySymbol: "§", currencyName: "scrip" },
  ticks: { perDay: 3, schedule: ["02:00", "10:00", "18:00"], timezone: "Asia/Kolkata", perWeek: 21 },
  season: { days: 90 },
  demoDay: {
    everyDays: 7,
    weekday: 5,
    tickOfDay: 3,
    minAgeDays: 7,
    listSize: 20,
    repPrizes: [10, 6, 3],
    creditPrizes: [2000, 1000, 500],
    bonusChecks: 1,
    bonusTopN: 10,
  },
  traits: { maxDeviation: 0.15 },
  stats: { min: 0.2, max: 0.9, dnaNudge: 0.05, seasonLearning: 0.02, pivotExecutionHit: 0.05 },
  agent: { memory: { maxEntries: 40, promptEntries: 8, textMax: 200, recencyHalfLifeTicks: 42 } },
  reputation: { start: 50, alpha: 0.15, seasonCarry: 0.5, min: 0, max: 100 },
  sectors: [
    { id: "ai_infra", name: "AI Infra", short: "AI", basePoolAnnual: 62_400_000, drift: 0.0004, volatility: 0.006, newsSensitivity: 1.2 },
    { id: "climate", name: "Climate", short: "CLM", basePoolAnnual: 48_200_000, drift: 0.0003, volatility: 0.005, newsSensitivity: 1.0 },
    { id: "fintech", name: "Fintech", short: "FIN", basePoolAnnual: 31_000_000, drift: 0.0001, volatility: 0.006, newsSensitivity: 1.1 },
    { id: "health", name: "Health", short: "HLT", basePoolAnnual: 27_800_000, drift: 0.0001, volatility: 0.004, newsSensitivity: 0.9 },
    { id: "devtools", name: "DevTools", short: "DEV", basePoolAnnual: 19_500_000, drift: 0.0002, volatility: 0.004, newsSensitivity: 0.8 },
    { id: "consumer", name: "Consumer", short: "CON", basePoolAnnual: 14_600_000, drift: 0.0, volatility: 0.007, newsSensitivity: 1.0 },
    { id: "space", name: "Space", short: "SPC", basePoolAnnual: 12_100_000, drift: 0.0002, volatility: 0.006, newsSensitivity: 1.3 },
  ],
  sectorAdjacency: {
    ai_infra: ["devtools", "fintech"],
    climate: ["space", "consumer"],
    fintech: ["ai_infra", "consumer"],
    health: ["ai_infra", "consumer"],
    devtools: ["ai_infra", "fintech"],
    consumer: ["fintech", "health"],
    space: ["climate", "ai_infra"],
  },
  sector: { penetration: 0.8, minCompanies: 5, poolClampMin: 0.5, poolClampMax: 2.0 },
  world: { hypeGain: 0.0004, minLiveCompanies: 36, restartsPerWeek: 3, restartCooldownTicks: 21 },
  hype: {
    start: 50,
    meanReversion: 0.05,
    newsGain: 6,
    herdingGain: 4,
    noise: 2,
    overheatedAt: 70,
    crashCoefficient: 0.00037,
    crashFloor: 55,
    herdShareThreshold: 0.4,
    bands: [20, 40, 60, 80],
  },
  crash: { coolingTicks: 21, poolHitMin: 0.15, poolHitMax: 0.4, hypeDrop: 25, interestPenalty: 0.1 },
  events: { maxShock: 0.12, spreadTicks: 3, perTickProb: 0.35, procedural: 0.4, flatBand: 0.005 },
  dna: { maxChars: 2000, editsPerSeason: 3 },
  ambition: {
    exitAcceptance: { bootstrap: 1.35, lifestyle: 1.2, moonshot: 1.6 },
    /** Added to pivot.threshold: high tolerance pivots earlier. Moonshot is "low until runway < 30 days". */
    pivotThresholdAdj: { bootstrap: -0.1, lifestyle: 0, moonshot: 0.15 },
    moonshotPivotRunwayDays: 30,
    /** Extra hires on a hiring week when the growth condition holds. */
    hireBias: { bootstrap: 0, lifestyle: 0, moonshot: 1 },
  },
  idea: {
    newsItems: 5,
    base: 0.35,
    wHeat: 0.25,
    wDna: 0.2,
    wNovelty: 0.2,
    noise: 0.05,
    qMin: 0.1,
    qMax: 1,
    dnaFitMin: 0.2,
    dnaFitMax: 0.9,
    duplicateAt: 0.8,
    duplicatePenalty: 0.25,
    duplicateCooldownTicks: 63,
    capitalRange: { preseed: [250_000, 1_000_000], seed: [500_000, 3_000_000], seriesA: [2_000_000, 6_000_000] },
    oneLinerMax: 120,
    customerMax: 80,
    problemMax: 140,
    solutionMax: 200,
  },
  hiring: { minRunwayDays: 60, minGrowth: 0.05, layoffRunwayDays: 30, highRiskAt: 0.7, everyTicks: 21, minHeadcount: 1 },
  marketing: { lowRunwayDays: 45, lowRunwayCap: 1, maxLevel: 3 },
  price: { ethicsDiscountAt: 0.7, riskPremiumAt: 0.7, ethicsPremiumBelow: 0.4 },
  fundraise: { triggerRunwayDays: 75, maxPitches: 6, pitchEveryTicks: 3, windowCooldownTicks: 21 },
  pitch: {
    cooldownTicks: 30,
    panelSize: 3,
    rubricWeights: { clarity: 0.15, market: 0.25, traction: 0.25, team: 0.15, defensibility: 0.2 },
    charismaEffect: 0.2,
    founderRepEffect: 0.05,
    interestBand: 0.35,
    freePerDay: 3,
    reactionMax: 240,
  },
  pivot: {
    threshold: 0.6,
    cooldownTicks: 18,
    interestPenalty: 0.05,
    forceRunwayDays: 20,
    tractionMult: 0.7,
    burnMult: 0.67,
    rejectionsNorm: 3,
    minPeers: 3,
    burnRunwayDays: 60,
    wRejections: 0.4,
    wCompetitor: 0.3,
    wBurn: 0.3,
  },
  fund: { size: 60_000_000, checkMin: 500_000, checkMax: 3_000_000 },
  vc: {
    weightMin: 0.02,
    weightMax: 0.6,
    herding: { phi: 0.5 },
    drift: { eta: 0.06, lossFactor: 0.8, markupMinMultiple: 1.5 },
    dealFlowPerTick: 3,
    meetingsPerTick: 1,
    repScale: 25,
    hitThreshold: 1.0,
    minInvestmentsForBoard: 3,
    fitWeights: { sector: 0.5, stage: 0.2, check: 0.15, redFlags: 0.15 },
    redFlagPenaltyPer: 0.5,
    stageAdjacent: 0.5,
    checkDistanceSlope: 0.5,
    reserveRatio: 0.15,
    followOnInterestMin: 0.5,
    archetypes: {
      hypeChaser: { label: "Hype chaser", interestBias: 0.08, fomo: 1.5, patience: 0.45, sectorFitMult: 1.0 },
      skeptic: { label: "Skeptic", interestBias: -0.08, fomo: 0.3, patience: 0.75, sectorFitMult: 1.0 },
      thesisDriven: { label: "Thesis-driven", interestBias: 0, fomo: 0, patience: 0.6, sectorFitMult: 1.3 },
    },
  },
  thesis: { maxChars: 2000, editsPerSeason: 3 },
  company: {
    baseOpsPerDay: 5000,
    salaryPerHeadPerDay: 1200,
    marketingCost: [0, 3000, 10000, 25000],
    luckSigma: 0.15,
    luckRho: 0.7,
    exp: { q: 1.0, execution: 1.0, team: 0.6, marketing: 0.5 },
    marketingStep: 0.35,
    concentration: 1.3,
    tierDemand: { discount: 1.25, standard: 1.0, premium: 0.75 },
    tierPrice: { discount: 0.8, standard: 1.0, premium: 1.25 },
    growthEma: 0.3,
    graceTicks: 6,
    teamHeadScale: 10,
    teamBase: 0.6,
    teamMin: 0.1,
    teamMax: 1,
    startHeadcount: 3,
    startingCash: 300_000,
    founderShare: 0.8,
    angelShare: 0.1,
    optionPoolShare: 0.1,
    tractionStart: 0.3,
    tractionRamp: 0.03,
  },
  zombie: { band: 0.02, windowTicks: 63, recoverTicks: 21 },
  outcome: { ipoValuation: 40_000_000, ipoSlotsPerSeason: 3, ipoBumpMin: 1.2, ipoBumpMax: 2.5, unicornValuation: 20_000_000, oddsRuns: 200, oddsHorizonCap: 90 },
  exit: {
    minAgeDays: 14,
    minPercentile: 0.5,
    minRevenue: 1_000_000,
    bidProbBase: 0.004,
    premiumMu: 0.7,
    premiumSigma: 0.8,
    maxPremium: 15,
    offerLifetimeTicks: 6,
  },
  valuation: {
    wGrowth: 0.5,
    wScale: 0.3,
    wEfficiency: 0.2,
    belowMedianCap: 0.5,
    smallBands: [0.8, 0.5, 0.2],
    slicePower: 3,
    poolMultiple: 1.0,
    hypeAdj: 0.2,
    revenueFloorMultiple: 1.0,
    ema: 0.35,
  },
  terms: {
    stageBasePre: { preseed: 3_000_000, seed: 8_000_000, seriesA: 24_000_000 },
    sectorMultMin: 0.6,
    sectorMultMax: 1.6,
    hypeFactorSlope: 0.004,
    checkBase: 0.8,
    checkInterest: 0.2,
    checkRound: 50_000,
    preBase: 0.75,
    preInterest: 0.5,
    boardSeatCheck: 3_000_000,
    proRataInterest: 0.6,
    optionPool: 0.1,
    liquidationPreference: "1x non-participating",
  },
  offer: { exclusivityTicks: 2, lifetimeTicks: 6 },
  negotiation: {
    maxCounters: 2,
    patienceHit: 0.2,
    pullBelow: 0.2,
    competitionDecay: 0.05,
    prePenalty: 1.6,
    checkPenalty: 0.8,
    patienceJitter: 0.1,
    npcCounterRatio: { bootstrap: 1.0, lifestyle: 1.0, moonshot: 1.15 },
  },
  economy: {
    seasonStipend: 10_000,
    stabilizerK: 1.5,
    targetSupply: 0,
    stabilizerMin: 0.25,
    stabilizerMax: 1.5,
    exitWalletCap: 250_000,
    exitWalletRatio: 0.002,
  },
  npc: { treasury: 500_000_000, treasuryTopUp: 300_000_000, acquirers: 3 },
  fees: { extraPitch: 300, closeRate: 0.01, exitRate: 0.02, extraEdit: 1000 },
  failure: { windDownRate: 0.05 },
  edits: { hardCapPerSeason: 6 },
  fraud: { fineFirst: 1000, fineSecond: 5000, pitchBanTicks: 6, suspendHours: 24, softThreshold: 0.4, highThreshold: 0.7, lowThreshold: 0.2 },
  gossip: { minSalience: 0.4, maxPostsPerTick: 12, reactionsPerDay: 30 },
  notifications: { maxPerDay: 4, quietStart: "23:00", quietEnd: "08:00" },
  moderation: { reportsPerDay: 10, autoHideAt: 3, noteMax: 280 },
  hook: { maxChars: 280, maxRedirects: 2, timeoutMs: 3000, maxBytes: 262_144, targetSeconds: 10, anonPerIp: 3 },
  rate: { hookPerHour: 5, draftApprovalsPerDay: 5, dnaSavesPerDay: 6 },
  newAccount: { pitchCooldownTicks: 3, fundCapMultiplier: 0.5 },
  decision: { windowTicks: 6, maxOpenPerUser: 3, urgentWithinTicks: 2 },
  agents: { maxPerUser: { founder: 1, vc: 1 } },
  rivalry: { minContested: 3 },
  cards: { idLength: 20, quoteMax: 120, maxLines: 4 },
  llm: { maxRetries: 1, timeoutMs: 20_000, maxTokens: 1200 },
  seed: { founders: 48, vcs: 12, acquirers: 3, ticks: 240, seasonSeed: "series-zero/season-1/fixed-demo-seed", startTick: 0 },
};

export type GameConfig = typeof defaultGameConfig;

/** Build a zod schema mirroring the shape and primitive types of the defaults. */
function schemaFrom(v: unknown): z.ZodType {
  if (typeof v === "number") return z.number().finite();
  if (typeof v === "string") return z.string();
  if (typeof v === "boolean") return z.boolean();
  if (Array.isArray(v)) {
    if (v.length === 0) return z.array(z.unknown());
    return z.array(schemaFrom(v[0]));
  }
  if (v && typeof v === "object") {
    const shape: Record<string, z.ZodType> = {};
    for (const [k, val] of Object.entries(v)) shape[k] = schemaFrom(val);
    return z.object(shape).strict();
  }
  return z.unknown();
}

const near1 = (xs: number[]) => Math.abs(xs.reduce((a, b) => a + b, 0) - 1) < 1e-9;

export const gameConfigSchema = (schemaFrom(defaultGameConfig) as z.ZodType<GameConfig>).superRefine((c, ctx) => {
  if (!near1(Object.values(c.pitch.rubricWeights))) ctx.addIssue({ code: "custom", message: "pitch.rubricWeights must sum to 1" });
  if (!near1([c.valuation.wGrowth, c.valuation.wScale, c.valuation.wEfficiency])) ctx.addIssue({ code: "custom", message: "valuation weights must sum to 1" });
  if (!near1(Object.values(c.vc.fitWeights))) ctx.addIssue({ code: "custom", message: "vc.fitWeights must sum to 1" });
  if (c.ticks.schedule.length !== c.ticks.perDay) ctx.addIssue({ code: "custom", message: "ticks.schedule length must equal ticks.perDay" });
  if (c.company.marketingCost.length !== c.marketing.maxLevel + 1) ctx.addIssue({ code: "custom", message: "company.marketingCost needs maxLevel + 1 entries" });
  const ids = c.sectors.map((s) => s.id);
  for (const id of SECTOR_IDS) if (!ids.includes(id)) ctx.addIssue({ code: "custom", message: `missing sector ${id}` });
  if (c.vc.weightMin * ids.length > 1 || c.vc.weightMax < 1 / ids.length) ctx.addIssue({ code: "custom", message: "vc weight clamps infeasible" });
});

export function validateGameConfig(input: unknown): GameConfig {
  return gameConfigSchema.parse(input);
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
}

/** Derived values used everywhere. */
export function seasonTicks(c: GameConfig): number {
  return c.season.days * c.ticks.perDay;
}
export function perTick(c: GameConfig, perDay: number): number {
  return perDay / c.ticks.perDay;
}
export function ticksToDays(c: GameConfig, ticks: number): number {
  return ticks / c.ticks.perDay;
}

export const gameConfig: GameConfig = validateGameConfig(defaultGameConfig);
