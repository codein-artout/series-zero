import type { WorldRepo } from "@/lib/db/repo";
import { emptyAppended, type Appended, type World } from "./types";

/** In-memory repository for tests and the seed run. Keeps every appended record in `log`. */
export class MemoryWorldRepo implements WorldRepo {
  log: Appended = emptyAppended();
  ticks = new Set<number>();
  saves = 0;
  constructor(public world: World | null = null) {}

  async load(): Promise<World | null> {
    return this.world;
  }

  async save(world: World): Promise<void> {
    this.world = world;
    for (const k of Object.keys(world.appended) as Array<keyof Appended>) {
      (this.log[k] as unknown[]).push(...(world.appended[k] as unknown[]));
    }
    for (const t of world.appended.ticks) this.ticks.add(t.number);
    world.ledger.drain();
    world.appended = emptyAppended();
    world.persistedIdeaIds = new Set(world.ideas.keys());
    this.saves++;
  }

  async hasTick(_seasonId: string, n: number): Promise<boolean> {
    return this.ticks.has(n);
  }
}
