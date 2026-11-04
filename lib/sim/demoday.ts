/** Demo Day (GAME.md section 14): weekly ranking, prizes, bonus meetings, posts. */
import type { GameConfig } from "@/config/game";
import { clamp } from "@/lib/rules/math";
import { fundBoard, fundMetrics } from "./funds";
import { companyAsk, fundFit, resolvePitch } from "./pitch";
import { agentPost, notify } from "./social";
import type { DemoDay, World } from "./types";
import { liveCompanies, nextId } from "./world";

/** Ticks are numbered from 1; the season starts on a Saturday, so every 7th day's evening tick is Friday. */
export function isDemoDayTick(tick: number, cfg: GameConfig): boolean {
  const every = cfg.demoDay.everyDays * cfg.ticks.perDay;
  const evening = cfg.demoDay.tickOfDay;
  return tick % every === 0 && ((tick - 1) % cfg.ticks.perDay) + 1 === evening;
}

export async function stepDemoDay(w: World, cfg: GameConfig, tick: number): Promise<DemoDay> {
  const minAge = cfg.demoDay.minAgeDays * cfg.ticks.perDay;
  const ranked = liveCompanies(w)
    .filter((c) => tick - c.createdTick >= minAge)
    .sort((a, b) => b.score - a.score || b.mark - a.mark || (a.id < b.id ? -1 : 1));
  const last = w.season.demoDaysHeld > 0 ? w.season.lastDemoRanks ?? {} : {};
  const entries = ranked.slice(0, cfg.demoDay.listSize).map((c, i) => {
    const lead = c.leadFundId ? w.funds.get(c.leadFundId)?.name : null;
    const prev = last[c.id];
    return { rank: i + 1, companyId: c.id, name: c.name, sector: c.sector, score: Number(c.score.toFixed(3)), mark: Math.round(c.mark), lead: lead ?? "Unfunded", move: prev ? prev - (i + 1) : 0 };
  });
  const funds = fundBoard(w, cfg).map((r, i) => {
    const m = fundMetrics(w, cfg, r.fund);
    return { rank: i + 1, fundId: r.id, name: r.fund.name, moic: Number(r.tvpi.toFixed(3)), hits: m.hits, total: m.total };
  });
  w.season.demoDaysHeld += 1;
  const dd: DemoDay = { id: nextId(w, "demo"), number: w.season.demoDaysHeld, tick, entries, funds };
  w.appended.demoDays.push(dd);
  w.season.lastDemoRanks = Object.fromEntries(entries.map((e) => [e.companyId, e.rank]));

  // Prizes: reputation +10/+6/+3 to founders, entry credits for player owners (minted next season).
  const credits = (w.season.prizeCredits ??= {});
  entries.slice(0, 3).forEach((e, i) => {
    const c = w.companies.get(e.companyId)!;
    const f = w.founders.get(c.founderId)!;
    f.reputation = clamp(f.reputation + cfg.demoDay.repPrizes[i], cfg.reputation.min, cfg.reputation.max);
    if (f.ownerId) {
      credits[f.ownerId] = (credits[f.ownerId] ?? 0) + cfg.demoDay.creditPrizes[i];
      notify(w, f.ownerId, tick, "demo_day", `${c.name} placed #${i + 1} at Demo Day. Can it hold the spot next Friday?`, "/demo-day");
    }
  });
  if (entries.length) {
    await agentPost(w, cfg, tick, {
      kind: "demo_day",
      authorType: "system",
      authorId: null,
      authorName: "Floor Marshal",
      facts: {},
      companyId: entries[0].companyId,
      fundId: null,
      refId: dd.id,
      salience: 1,
      text: `Demo Day ${dd.number}: ${entries[0].name} took #1 with a score of ${entries[0].score.toFixed(2)}.${entries[1] ? ` ${entries[1].name} close behind.` : ""}`,
    });
  }
  // Bonus meetings: each fund gets demoDay.bonusChecks meeting(s) among the top 10.
  const top = entries.slice(0, cfg.demoDay.bonusTopN).map((e) => w.companies.get(e.companyId)!);
  for (const f of [...w.funds.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (f.status !== "active") continue;
    if (f.ownerId) {
      f.bonusMeetings += cfg.demoDay.bonusChecks;
      notify(w, f.ownerId, tick, "demo_day", `Demo Day is live. ${f.name} has a bonus meeting with a top-10 founder. Who gets it?`, "/demo-day");
      continue;
    }
    for (let k = 0; k < cfg.demoDay.bonusChecks; k++) {
      const pick = top
        .filter((c) => (c.status === "alive" || c.status === "zombie") && (c.lastPitchByFund[f.id] ?? -1e9) <= tick - cfg.pitch.cooldownTicks)
        .filter((c) => !w.founders.get(c.founderId)?.ownerId || w.founders.get(c.founderId)?.ownerId !== f.ownerId)
        .sort((a, b) => fundFit(w, cfg, f, b, companyAsk(w, cfg, b)) - fundFit(w, cfg, f, a, companyAsk(w, cfg, a)) || (a.id < b.id ? -1 : 1))[0];
      if (pick && ![...w.offers.values()].some((o) => o.companyId === pick.id && o.status === "open")) await resolvePitch(w, cfg, pick, tick, { source: "npc", panel: [f] });
    }
  }
  return dd;
}
