/** Player decisions (GAME.md section 13). Every decision stores inputs, choice, who made it, outcome. */
import type { GameConfig } from "@/config/game";
import type { Decision, DecisionKind, Id, World } from "./types";
import { nextId } from "./world";

export function openDecisions(w: World, userId: Id): Decision[] {
  return [...w.decisions.values()].filter((d) => d.userId === userId && d.status === "open").sort((a, b) => a.expiresTick - b.expiresTick || (a.id < b.id ? -1 : 1));
}

/**
 * Creates an open decision. When the user already has decisions.maxOpenPerUser open, the new one
 * is still recorded but resolved by its default immediately (by = "default") so the inbox stays short.
 */
export function createDecision(
  w: World,
  cfg: GameConfig,
  p: { userId: Id; kind: DecisionKind; refId: Id; agentId: Id; tick: number; expiresTick: number; inputs: Record<string, unknown> },
): Decision {
  const d: Decision = {
    id: nextId(w, "dec"),
    userId: p.userId,
    kind: p.kind,
    refId: p.refId,
    agentId: p.agentId,
    createdTick: p.tick,
    expiresTick: p.expiresTick,
    status: "open",
    choice: null,
    by: null,
    inputs: p.inputs,
    outcome: null,
  };
  if (openDecisions(w, p.userId).length >= cfg.decision.maxOpenPerUser) {
    d.status = "expired";
    d.by = "default";
    d.choice = "overflow";
    d.outcome = `Inbox full (${cfg.decision.maxOpenPerUser} open calls). Default applied.`;
  }
  w.decisions.set(d.id, d);
  return d;
}

export function resolveDecisionsFor(w: World, refId: Id, choice: string, by: "player" | "default", outcome: string): void {
  for (const d of w.decisions.values()) {
    if (d.refId === refId && d.status === "open") {
      d.status = by === "player" ? "resolved" : "expired";
      d.choice = choice;
      d.by = by;
      d.outcome = outcome;
    }
  }
}

export function dueDecisions(w: World, tick: number): Decision[] {
  return [...w.decisions.values()].filter((d) => d.status === "open" && tick >= d.expiresTick).sort((a, b) => (a.id < b.id ? -1 : 1));
}
