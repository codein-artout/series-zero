/** Rivalries (GAME.md section 14). Feud score counts contested deals; shown at rivalry.minContested. */
import type { GameConfig } from "@/config/game";
import type { FeudState, Id, World } from "./types";

export function feudKey(kind: FeudState["kind"], a: Id, b: Id): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${kind}:${x}:${y}`;
}

/** Record a contested deal between two parties; `winner` (if any) gets a point. */
export function bumpFeud(w: World, kind: FeudState["kind"], a: Id, b: Id, winner: Id | null): FeudState {
  const key = feudKey(kind, a, b);
  const [x, y] = a < b ? [a, b] : [b, a];
  const f = w.feuds.get(key) ?? { a: x, b: y, kind, aWins: 0, bWins: 0, contested: 0 };
  if (winner === null) f.contested += 1;
  else if (winner === f.a) f.aWins += 1;
  else if (winner === f.b) f.bWins += 1;
  w.feuds.set(key, f);
  return f;
}

export function visibleFeuds(w: World, cfg: GameConfig): FeudState[] {
  return [...w.feuds.values()].filter((f) => f.contested >= cfg.rivalry.minContested).sort((p, q) => q.contested - p.contested || q.aWins + q.bWins - (p.aWins + p.bWins));
}
