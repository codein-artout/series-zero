/** Validation of player-written agent text (DNA, thesis). Pure. */
import type { GameConfig } from "@/config/game";

export function lengthError(kind: "DNA" | "thesis", text: string, max: number): string | null {
  if (text.length <= max) return null;
  return `Your ${kind} is ${text.length.toLocaleString("en-US")} characters. The limit is ${max.toLocaleString("en-US")}.`;
}

export type EditCost = { ok: true; fee: number; usesFreeEdit: boolean } | { ok: false; error: string };

/**
 * Edits: the first save at creation is free; then editsPerSeason edits; then extra edits cost
 * fees.extraEdit each, up to edits.hardCapPerSeason total.
 */
export function editCost(editsUsed: number, perSeason: number, cfg: GameConfig): EditCost {
  if (editsUsed >= cfg.edits.hardCapPerSeason) return { ok: false, error: `You have used all ${cfg.edits.hardCapPerSeason} edits this season.` };
  if (editsUsed < perSeason) return { ok: true, fee: 0, usesFreeEdit: true };
  return { ok: true, fee: cfg.fees.extraEdit, usesFreeEdit: false };
}
