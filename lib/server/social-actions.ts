import { randomUUID } from "node:crypto";
import { loadGameConfig } from "@/config/load";
import { prisma } from "@/lib/db/client";
import { getSocialProvider } from "@/lib/providers/social";
import { DAY_MS, rateLimit } from "./ratelimit";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string; status: number };

export async function reactToPost(userId: string, postId: string, kind: "cosign" | "roast"): Promise<ActionResult> {
  const cfg = loadGameConfig();
  const db = await prisma();
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post || post.hidden) return { ok: false, error: "That post is gone.", status: 404 };
  if (post.authorType === "system") return { ok: false, error: "System posts take no reactions.", status: 400 };
  const existing = await db.postReaction.findUnique({ where: { postId_userId_kind: { postId, userId, kind } } });
  if (existing) return { ok: true, message: "Already counted." };
  const rl = await rateLimit(`react:${userId}`, cfg.gossip.reactionsPerDay, DAY_MS);
  if (!rl.ok) return { ok: false, error: `You have used all ${cfg.gossip.reactionsPerDay} reactions for today.`, status: 429 };
  await db.postReaction.create({ data: { id: randomUUID(), postId, userId, kind } });
  await db.post.update({ where: { id: postId }, data: kind === "cosign" ? { cosigns: { increment: 1 } } : { roasts: { increment: 1 } } });
  return { ok: true, message: kind === "cosign" ? "Cosigned." : "Roasted back." };
}

export async function decideDraft(userId: string, draftId: string, action: "approve" | "reject"): Promise<ActionResult> {
  const cfg = loadGameConfig();
  const db = await prisma();
  const d = await db.draft.findUnique({ where: { id: draftId } });
  if (!d || d.ownerId !== userId) return { ok: false, error: "That draft is not yours.", status: 404 };
  if (d.status !== "pending") return { ok: false, error: "That draft was already decided.", status: 400 };
  if (action === "approve") {
    const rl = await rateLimit(`draft-approve:${userId}`, cfg.rate.draftApprovalsPerDay, DAY_MS);
    if (!rl.ok) return { ok: false, error: `You can approve ${cfg.rate.draftApprovalsPerDay} drafts a day.`, status: 429 };
    await getSocialProvider().publish({ id: d.id, agentId: d.agentId, text: d.text });
  }
  await db.draft.update({ where: { id: draftId }, data: { status: action === "approve" ? "approved" : "rejected", decidedAt: new Date() } });
  return { ok: true, message: action === "approve" ? "Approved. Logged only: nothing posts outside the game." : "Rejected." };
}
