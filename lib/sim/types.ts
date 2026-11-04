/**
 * World state the tick engine runs on. Loaded from and saved to the DB by a repository
 * (lib/db/repo.ts) or kept in memory (lib/sim/memory-repo.ts) for tests and the seed run.
 */
import type { Ambition, Archetype, PriceTier, RedFlag, SectorId, Stage } from "@/config/game";
import type { Ledger, LedgerEntry } from "@/lib/ledger";

export type Id = string;

export interface Traits {
  riskAppetite: number;
  ethics: number;
  patience: number;
  ambition: number;
}

export interface HiddenStats {
  execution: number;
  teamSeed: number;
  charisma: number;
}

export interface MemoryEntry {
  tick: number;
  type: string;
  text: string;
  salience: number;
}

export type AgentStatus = "active" | "suspended" | "retired";

export interface FounderAgent {
  id: Id;
  name: string;
  ownerId: Id | null;
  traits: Traits;
  ambition: Ambition;
  stats: HiddenStats;
  memory: MemoryEntry[];
  reputation: number;
  status: AgentStatus;
  dna: string;
  dnaHash: string;
  dnaEdits: number;
  dnaHistory: Array<{ tick: number; hash: string; chars: number }>;
  fraudCount: number;
  pitchBanUntil: number;
  suspendedUntil: number;
  companyId: Id | null;
  createdTick: number;
  isDemo?: boolean;
}

export interface Fund {
  id: Id;
  name: string;
  ownerId: Id | null;
  archetype: Archetype;
  traits: Traits;
  thesisText: string;
  driftNotes: Array<{ tick: number; text: string }>;
  sectorWeights: Record<SectorId, number>;
  startWeights: Record<SectorId, number>;
  stages: Stage[];
  checkMin: number;
  checkMax: number;
  redFlags: RedFlag[];
  redFlagLines: string[];
  styleLine: string;
  reputation: number;
  size: number;
  paidIn: number;
  distributions: number;
  thesisEdits: number;
  cooling: Partial<Record<SectorId, number>>;
  memory: MemoryEntry[];
  status: AgentStatus;
  createdTick: number;
  /** Pitch requests routed to this fund this tick (player funds choose one). */
  pendingMeetings: Id[];
  bonusMeetings: number;
  moicHistory: Array<{ tick: number; moic: number }>;
  isDemo?: boolean;
}

export interface Acquirer {
  id: Id;
  name: string;
}

export interface Shock {
  sector: SectorId;
  perTick: number;
  remaining: number;
  eventId: Id;
}

export interface SectorState {
  id: SectorId;
  pool: number;
  /** pool at the end of each of the last N ticks (oldest first). */
  history: number[];
}

export type CompanyStatus = "alive" | "zombie" | "dead" | "acquired" | "public";

export interface CapEntry {
  holderType: "founder" | "angels" | "pool" | "fund";
  holderId: Id | null;
  name: string;
  share: number;
}

export interface Company {
  id: Id;
  name: string;
  founderId: Id;
  sector: SectorId;
  ideaId: Id;
  stage: Stage;
  status: CompanyStatus;
  debt: number;
  headcount: number;
  marketingLevel: number;
  priceTier: PriceTier;
  q: number;
  execution: number;
  teamSeed: number;
  traction: number;
  luckZ: number;
  rejections: number;
  raising: boolean;
  windowStartTick: number;
  pitchesInWindow: number;
  lastPitchTick: number;
  lastPivotTick: number;
  pivotCount: number;
  revenueHistory: number[];
  lastRevenue: number;
  lastBurn: number;
  growth7d: number;
  growthRaw: number;
  mark: number;
  targetMark: number;
  score: number;
  sectorPercentile: number;
  sectorRank: number;
  sectorSize: number;
  metricPct: { growth: number; scale: number; efficiency: number };
  zombieTicks: number;
  recoverTicks: number;
  graceLeft: number;
  createdTick: number;
  endedTick: number | null;
  capTable: CapEntry[];
  lastPitchByFund: Record<Id, number>;
  revenueTotal: number;
  burnTotal: number;
  realizedValue: number;
  exitPrice: number | null;
  acquirerId: Id | null;
  leadFundId: Id | null;
  rounds: number;
  outcome: string | null;
  isDemo?: boolean;
}

export type BusinessModel = "subscription" | "marketplace" | "usage" | "hardware" | "licensing" | "ads";
export type Moat = "data" | "network" | "brand" | "regulatory" | "tech" | "none";

export interface Idea {
  id: Id;
  founderId: Id;
  companyId: Id | null;
  sector: SectorId;
  oneLiner: string;
  customer: string;
  problem: string;
  solution: string;
  businessModel: BusinessModel;
  moat: Moat;
  stage: Stage;
  capitalNeeded: number;
  q: number;
  dnaFit: number;
  novelty: number;
  duplicate: boolean;
  tick: number;
  source: "seed" | "hook" | "pivot" | "player";
}

export interface Rubric {
  clarity: number;
  market: number;
  traction: number;
  team: number;
  defensibility: number;
}

export interface PitchReaction {
  fundId: Id;
  interestRaw: number;
  interest: number;
  fit: number;
  p: number;
  roll: number | null;
  offer: boolean;
  text: string;
  redFlags: RedFlag[];
}

export interface FraudFinding {
  severity: "none" | "low" | "high";
  score: number;
  reasons: string[];
  judgeFlag: boolean;
  fine: number;
  offence: number;
}

export interface Pitch {
  id: Id;
  tick: number;
  companyId: Id;
  founderId: Id;
  ideaId: Id;
  stage: Stage;
  ask: number;
  askPre: number;
  panel: Id[];
  rubric: Rubric;
  Q: number;
  Qprime: number;
  reactions: PitchReaction[];
  fraud: FraudFinding;
  commitment: string;
  offerIds: Id[];
  note: string;
  source: "npc" | "player" | "hook";
  provider: string;
}

export type OfferStatus = "open" | "accepted" | "declined" | "lapsed" | "pulled" | "superseded";

export interface Counter {
  n: number;
  check: number;
  preMoney: number;
  A: number;
  roll: number;
  accepted: boolean;
  tick: number;
}

export interface Offer {
  id: Id;
  pitchId: Id;
  companyId: Id;
  fundId: Id;
  tick: number;
  expiresTick: number;
  exclusiveUntil: number;
  status: OfferStatus;
  check: number;
  preMoney: number;
  postMoney: number;
  ownership: number;
  board: "observer" | "seat";
  proRata: boolean;
  liqPref: string;
  optionPool: number;
  interest: number;
  patience: number;
  counters: Counter[];
  decidedBy: "player" | "default" | "npc" | null;
  decidedTick: number | null;
  note: string;
}

export interface Deal {
  id: Id;
  offerId: Id | null;
  companyId: Id;
  fundId: Id;
  tick: number;
  check: number;
  preMoney: number;
  postMoney: number;
  ownership: number;
  status: "live" | "exited" | "written_off";
  proceeds: number;
  lead: boolean;
  followOn: boolean;
}

export interface ExitOffer {
  id: Id;
  companyId: Id;
  acquirerId: Id;
  tick: number;
  expiresTick: number;
  bid: number;
  mark: number;
  premium: number;
  status: "open" | "accepted" | "declined" | "lapsed";
  decidedBy: "player" | "default" | "npc" | null;
}

export type DecisionKind = "term_sheet" | "pivot" | "exit" | "meeting";

export interface Decision {
  id: Id;
  userId: Id;
  kind: DecisionKind;
  refId: Id;
  agentId: Id;
  createdTick: number;
  expiresTick: number;
  status: "open" | "resolved" | "expired";
  choice: string | null;
  by: "player" | "default" | null;
  inputs: Record<string, unknown>;
  outcome: string | null;
}

export type EventKind = "breakthrough" | "regulation" | "market" | "crash" | "herding";

export interface WorldEvent {
  id: Id;
  tick: number;
  headline: string;
  sector: SectorId;
  sentiment: number;
  magnitude: number;
  kind: EventKind;
  source: "fixture" | "procedural" | "provider" | "system";
  shock: number;
}

export type PostKind = "pass" | "term_sheet" | "funded" | "pivot" | "exit" | "death" | "fraud" | "demo_day" | "general";

export interface Post {
  id: Id;
  tick: number;
  authorType: "founder" | "vc" | "system";
  authorId: Id | null;
  authorName: string;
  kind: PostKind;
  text: string;
  companyId: Id | null;
  fundId: Id | null;
  refId: Id | null;
  salience: number;
  fine: number;
  hidden: boolean;
  cosigns: number;
  roasts: number;
}

export interface Notification {
  id: Id;
  userId: Id;
  tick: number;
  type: string;
  text: string;
  href: string;
}

export interface Draft {
  id: Id;
  agentId: Id;
  agentType: "founder" | "vc";
  ownerId: Id | null;
  text: string;
  status: "pending" | "approved" | "rejected";
  tick: number;
}

export type CardKind = "term_sheet" | "roast" | "exit";

export interface CardRecord {
  id: Id;
  kind: CardKind;
  refId: Id;
  ownerId: Id | null;
  tick: number;
  data: Record<string, string | number>;
}

export interface DemoDayEntry {
  rank: number;
  companyId: Id;
  name: string;
  sector: SectorId;
  score: number;
  mark: number;
  lead: string;
  move: number;
}

export interface DemoDay {
  id: Id;
  number: number;
  tick: number;
  entries: DemoDayEntry[];
  funds: Array<{ rank: number; fundId: Id; name: string; moic: number; hits: number; total: number }>;
}

export interface Mark {
  tick: number;
  companyId: Id;
  mark: number;
  sector: SectorId;
}

export interface FeudState {
  a: Id;
  b: Id;
  kind: "funds" | "companies";
  aWins: number;
  bWins: number;
  contested: number;
}

export interface TickRecord {
  number: number;
  digest: string;
  supply: number;
  minted: number;
  burned: number;
  stabilizer: number;
  hype: number;
  summary: Record<string, number>;
}

export interface Season {
  id: Id;
  number: number;
  /** Optimistic concurrency version (DB). */
  version: number;
  seed: string;
  commit: string;
  revealed: boolean;
  tick: number;
  hype: number;
  hypeHistory: number[];
  targetSupply: number;
  ipoSlotsUsed: number;
  demoDaysHeld: number;
  status: "running" | "ended";
  shocks: Shock[];
  idSeq: number;
  checksBySector: Partial<Record<SectorId, number>>;
}

/** Records appended during a tick (or action) that the repository must insert. */
export interface Appended {
  pitches: Pitch[];
  events: WorldEvent[];
  posts: Post[];
  notifications: Notification[];
  ledger: LedgerEntry[];
  marks: Mark[];
  demoDays: DemoDay[];
  ideas: Idea[];
  ticks: TickRecord[];
  drafts: Draft[];
  cards: CardRecord[];
}

export interface World {
  season: Season;
  sectors: SectorState[];
  founders: Map<Id, FounderAgent>;
  funds: Map<Id, Fund>;
  acquirers: Acquirer[];
  companies: Map<Id, Company>;
  ideas: Map<Id, Idea>;
  offers: Map<Id, Offer>;
  deals: Map<Id, Deal>;
  exitOffers: Map<Id, ExitOffer>;
  decisions: Map<Id, Decision>;
  feuds: Map<string, FeudState>;
  ledger: Ledger;
  /** Wallet holders (user ids) with stipends this season. */
  wallets: Id[];
  appended: Appended;
  /** Recent events still needed by rules (news for ideas). */
  recentEvents: WorldEvent[];
  /** Ids of ideas already persisted (others in `ideas` are new). */
  persistedIdeaIds?: Set<Id>;
}

export function emptyAppended(): Appended {
  return { pitches: [], events: [], posts: [], notifications: [], ledger: [], marks: [], demoDays: [], ideas: [], ticks: [], drafts: [], cards: [] };
}
