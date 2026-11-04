/** Gossip posts, notifications and cards created by the engine. */
import type { GameConfig } from "@/config/game";
import { callStructured } from "@/lib/llm/call";
import { PostOutput } from "@/lib/llm/schemas";
import { moderate } from "@/lib/providers/moderation";
import { sha256Hex } from "@/lib/rules/hash";
import { cleanField } from "@/lib/safety/sanitize";
import type { CardKind, CardRecord, Id, Post, PostKind, World } from "./types";
import { addPost, nextId } from "./world";

export interface PostSpec {
  kind: PostKind;
  authorType: Post["authorType"];
  authorId: Id | null;
  authorName: string;
  archetype?: string;
  facts: Record<string, string | number>;
  companyId: Id | null;
  fundId: Id | null;
  refId: Id | null;
  salience: number;
  fine?: number;
  /** Fixed text (system posts are rule-generated). */
  text?: string;
}

export function postsThisTick(w: World, tick: number): number {
  return w.appended.posts.filter((p) => p.tick === tick && p.authorType !== "system").length;
}

export async function agentPost(w: World, cfg: GameConfig, tick: number, s: PostSpec): Promise<Post | null> {
  const system = s.authorType === "system";
  if (!system && s.salience < cfg.gossip.minSalience) return null;
  if (!system && postsThisTick(w, tick) >= cfg.gossip.maxPostsPerTick) return null;
  let text = s.text;
  if (!text) {
    const { value } = await callStructured(
      "post",
      PostOutput,
      { kind: s.kind, author: { name: s.authorName, type: s.authorType, archetype: s.archetype }, facts: s.facts },
      `${s.refId ?? "x"}|${s.kind}|${s.authorId ?? "sys"}|${tick}`,
    );
    text = value.text;
  }
  text = cleanField(text, 240);
  if (!text) return null;
  const mod = await moderate(text, `post:${s.kind}`);
  if (!mod.allowed && !system) return null;
  const post = addPost(w, {
    tick,
    authorType: s.authorType,
    authorId: s.authorId,
    authorName: s.authorName,
    kind: s.kind,
    text,
    companyId: s.companyId,
    fundId: s.fundId,
    refId: s.refId,
    salience: s.salience,
    fine: s.fine ?? 0,
  });
  // Player-owned agents also queue a draft for outside platforms (log only, needs owner approval).
  const ownerId = s.authorType === "founder" ? w.founders.get(s.authorId ?? "")?.ownerId : s.authorType === "vc" ? w.funds.get(s.authorId ?? "")?.ownerId : null;
  if (ownerId && s.authorId) {
    w.appended.drafts.push({ id: nextId(w, "draft"), agentId: s.authorId, agentType: s.authorType === "vc" ? "vc" : "founder", ownerId, text: post.text, status: "pending", tick });
  }
  return post;
}

/** Card ids are unguessable during the season: derived from the secret season seed. */
export function cardId(seed: string, kind: CardKind, refId: Id): string {
  return sha256Hex(`${seed}|card|${kind}|${refId}`).slice(0, 20);
}

export function createCard(w: World, kind: CardKind, refId: Id, ownerId: Id | null, tick: number, data: CardRecord["data"]): CardRecord {
  const c: CardRecord = { id: cardId(w.season.seed, kind, refId), kind, refId, ownerId, tick, data };
  w.appended.cards.push(c);
  return c;
}

export function notify(w: World, userId: Id, tick: number, type: string, text: string, href: string): void {
  w.appended.notifications.push({ id: nextId(w, "ntf"), userId, tick, type, text, href });
}
