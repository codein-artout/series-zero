import type { GameConfig } from "@/config/game";
import { Ledger } from "@/lib/ledger";
import { seedCommitment } from "@/lib/rules/rng";
import { emptyAppended, type World } from "./types";

/** An empty world at tick 0 of a new season. */
export function createWorld(seed: string, cfg: GameConfig, seasonNumber = 1): World {
  return {
    season: {
      id: `season_${seasonNumber}`,
      number: seasonNumber,
      version: 0,
      seed,
      commit: seedCommitment(seed),
      revealed: false,
      tick: 0,
      hype: cfg.hype.start,
      hypeHistory: [cfg.hype.start],
      targetSupply: cfg.economy.targetSupply,
      ipoSlotsUsed: 0,
      demoDaysHeld: 0,
      status: "running",
      shocks: [],
      idSeq: 0,
      checksBySector: {},
    },
    sectors: cfg.sectors.map((s) => ({ id: s.id as World["sectors"][number]["id"], pool: s.basePoolAnnual, history: [s.basePoolAnnual] })),
    founders: new Map(),
    funds: new Map(),
    acquirers: [],
    companies: new Map(),
    ideas: new Map(),
    offers: new Map(),
    deals: new Map(),
    exitOffers: new Map(),
    decisions: new Map(),
    feuds: new Map(),
    ledger: new Ledger(),
    wallets: [],
    appended: emptyAppended(),
    recentEvents: [],
    persistedIdeaIds: new Set(),
  };
}
