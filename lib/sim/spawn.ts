/** Keeps the floor populated: idle NPC founders restart with a new company (weekly, capped). */
import type { GameConfig, Stage } from "@/config/game";
import { createCompany, generateIdea } from "./agents";
import type { World } from "./types";
import { liveCompanies, rng } from "./world";

export async function stepRestarts(w: World, cfg: GameConfig, tick: number): Promise<number> {
  if (tick % cfg.ticks.perWeek !== 0) return 0;
  if (liveCompanies(w).length >= cfg.world.minLiveCompanies) return 0;
  const idle = [...w.founders.values()]
    .filter((f) => !f.ownerId && f.status === "active" && !f.companyId)
    .filter((f) => {
      const last = [...w.companies.values()].filter((c) => c.founderId === f.id).reduce((a, c) => Math.max(a, c.endedTick ?? c.createdTick), -1e9);
      return tick - last >= cfg.world.restartCooldownTicks;
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const r = rng(w, tick, "idea", "restarts");
  const picks = r.shuffle(idle).slice(0, cfg.world.restartsPerWeek);
  for (const f of picks) {
    const stage: Stage = r.next() < 0.7 ? "preseed" : "seed";
    const g = await generateIdea(w, cfg, f, tick, { stage, source: "seed" });
    createCompany(w, cfg, f, g.idea, g.name, tick);
  }
  return picks.length;
}
