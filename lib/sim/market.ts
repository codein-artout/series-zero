/** Market step: news to events, pool shocks, pools, hype, crash. Runs once per tick. */
import type { GameConfig, SectorId } from "@/config/game";
import { getNewsProvider } from "@/lib/providers/news";
import { crashProbability, herdSpike, hypeStep, newsImpact, newsShock, poolStep } from "@/lib/rules/world";
import type { World, WorldEvent } from "./types";
import { addPost, nextId, rng, sectorConfig, sectorGrowth7d } from "./world";

const HISTORY_KEEP = 64;

export async function stepMarket(w: World, cfg: GameConfig, tick: number): Promise<{ events: WorldEvent[]; crashed: SectorId | null }> {
  const evRng = rng(w, tick, "event", "news");
  const items = await getNewsProvider().fetch(tick, evRng, cfg);
  const events: WorldEvent[] = [];
  for (const it of items) {
    const sc = sectorConfig(cfg, it.sector);
    const shock = newsShock(it.sentiment, it.magnitude, sc.newsSensitivity, cfg);
    const ev: WorldEvent = { id: nextId(w, "ev"), tick, headline: it.headline, sector: it.sector, sentiment: it.sentiment, magnitude: it.magnitude, kind: it.kind, source: it.source, shock: shock.total };
    events.push(ev);
    w.season.shocks.push({ sector: it.sector, perTick: shock.perTick, remaining: shock.ticks, eventId: ev.id });
  }

  // Pools
  const H = w.season.hype;
  for (const s of w.sectors) {
    const sc = sectorConfig(cfg, s.id);
    let shock = 0;
    for (const sh of w.season.shocks) if (sh.sector === s.id && sh.remaining > 0) shock += sh.perTick;
    const z = rng(w, tick, "event", `pool:${s.id}`).normal();
    s.pool = poolStep(s.pool, sc.basePoolAnnual, { drift: sc.drift, volatility: sc.volatility, H, shock, z }, cfg);
  }
  for (const sh of w.season.shocks) sh.remaining -= 1;
  w.season.shocks = w.season.shocks.filter((sh) => sh.remaining > 0);

  // Hype
  const hz = rng(w, tick, "hype", "index").normal();
  const herd = herdSpike(w.season.checksBySector, cfg);
  let nextH = hypeStep(H, newsImpact(events), herd, hz, cfg);
  w.season.checksBySector = {};

  // Crash
  let crashed: SectorId | null = null;
  const cr = rng(w, tick, "crash", "roll");
  if (cr.next() < crashProbability(nextH, cfg)) {
    const target = [...w.sectors].sort((a, b) => sectorGrowth7d(b, cfg) - sectorGrowth7d(a, cfg) || (a.id < b.id ? -1 : 1))[0];
    const hit = cr.uniform(cfg.crash.poolHitMin, cfg.crash.poolHitMax);
    const sc = sectorConfig(cfg, target.id);
    target.pool = Math.max(cfg.sector.poolClampMin * sc.basePoolAnnual, target.pool * (1 - hit));
    nextH = Math.max(0, nextH - cfg.crash.hypeDrop);
    crashed = target.id;
    for (const f of w.funds.values()) f.cooling[target.id] = tick + cfg.crash.coolingTicks;
    const ev: WorldEvent = { id: nextId(w, "ev"), tick, headline: `${sc.name} pool crashes ${Math.round(hit * 100)}% in one tick`, sector: target.id, sentiment: -1, magnitude: hit, kind: "crash", source: "system", shock: -hit };
    events.push(ev);
    addPost(w, { tick, authorType: "system", authorId: null, authorName: "Floor Marshal", kind: "general", text: `Crash: the ${sc.name} pool lost ${Math.round(hit * 100)}% this tick. VCs are cooling on ${sc.name} for ${cfg.crash.coolingTicks} ticks.`, companyId: null, fundId: null, refId: ev.id, salience: 1, fine: 0 });
  }
  w.season.hype = nextH;
  w.season.hypeHistory.push(nextH);
  if (w.season.hypeHistory.length > HISTORY_KEEP) w.season.hypeHistory.splice(0, w.season.hypeHistory.length - HISTORY_KEEP);
  for (const s of w.sectors) {
    s.history.push(s.pool);
    if (s.history.length > HISTORY_KEEP) s.history.splice(0, s.history.length - HISTORY_KEEP);
  }
  w.appended.events.push(...events);
  w.recentEvents.push(...events);
  w.recentEvents = w.recentEvents.filter((e) => e.tick >= tick - cfg.ticks.perWeek);
  return { events, crashed };
}
