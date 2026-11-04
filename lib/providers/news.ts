/**
 * NewsProvider: the world's headline source. The default MockNewsProvider draws from a fixture
 * feed plus procedurally generated headlines, seeded by the tick's `event` substream. No network.
 */
import type { GameConfig, SectorId } from "@/config/game";
import { SECTOR_IDS } from "@/config/game";
import type { Rng } from "@/lib/rules/rng";
import fixtures from "./fixtures/news.json";

export interface NewsItem {
  id: string;
  headline: string;
  sector: SectorId;
  sentiment: number;
  magnitude: number;
  kind: "breakthrough" | "regulation" | "market";
  tick: number;
  source: "fixture" | "procedural" | "provider";
}

export interface NewsProvider {
  readonly name: string;
  /** Must be deterministic given the rng. */
  fetch(tick: number, rng: Rng, cfg: GameConfig): Promise<NewsItem[]>;
}

const PROC_SUBJECT: Record<SectorId, string[]> = {
  ai_infra: ["Model lab", "Inference cloud", "Agent platform", "Eval consortium"],
  climate: ["Grid operator", "Battery maker", "Water board", "Solar co-op"],
  fintech: ["Payments regulator", "Neobank", "Lending marketplace", "Card network"],
  health: ["Clinic network", "Drug maker", "Health ministry", "Hospital group"],
  devtools: ["Cloud provider", "Open source foundation", "Code host", "CI vendor"],
  consumer: ["Retail index", "App store", "Delivery platform", "Creator platform"],
  space: ["Launch provider", "Satellite operator", "Orbit registry", "Space agency"],
};
const PROC_POS = ["reports record demand", "cuts prices by a third", "wins a large public contract", "doubles capacity", "beats forecasts"];
const PROC_NEG = ["faces a fresh probe", "delays its flagship launch", "reports a shortage", "halts expansion", "misses forecasts"];

export class MockNewsProvider implements NewsProvider {
  readonly name = "fixture";
  async fetch(tick: number, rng: Rng, cfg: GameConfig): Promise<NewsItem[]> {
    if (rng.next() >= cfg.events.perTickProb) return [];
    if (rng.next() >= cfg.events.procedural) {
      const f = fixtures[rng.int(fixtures.length)];
      return [{ id: `news_${tick}_f`, headline: f.headline, sector: f.sector as SectorId, sentiment: f.sentiment, magnitude: f.magnitude, kind: f.kind as NewsItem["kind"], tick, source: "fixture" }];
    }
    const sector = rng.pick(SECTOR_IDS);
    const positive = rng.next() < 0.55;
    const headline = `${rng.pick(PROC_SUBJECT[sector])} ${rng.pick(positive ? PROC_POS : PROC_NEG)}`;
    const sentiment = (positive ? 1 : -1) * (0.3 + 0.5 * rng.next());
    const magnitude = 0.2 + 0.5 * rng.next();
    return [{ id: `news_${tick}_p`, headline, sector, sentiment, magnitude, kind: "market", tick, source: "procedural" }];
  }
}

let current: NewsProvider = new MockNewsProvider();
export function getNewsProvider(): NewsProvider {
  return current;
}
export function setNewsProvider(p: NewsProvider): void {
  current = p;
}
