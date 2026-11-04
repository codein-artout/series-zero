import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadGameConfig } from "@/config/load";
import { prisma } from "@/lib/db/client";
import { DAY_MS, rateLimit } from "./ratelimit";
import type { ActionResult } from "./social-actions";

export const REPORT_TARGETS = ["post", "pitch", "card", "company", "founder", "fund"] as const;
export const REPORT_REASONS = ["harassment", "real_person", "real_company", "spam", "injection", "other"] as const;

export const ReportInput = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1).max(80),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(280).default(""),
});

export async function fileReport(userId: string, input: z.infer<typeof ReportInput>): Promise<ActionResult> {
  const cfg = loadGameConfig();
  const db = await prisma();
  const dup = await db.report.findUnique({ where: { reporterId_targetType_targetId: { reporterId: userId, targetType: input.targetType, targetId: input.targetId } } });
  if (dup) return { ok: true, message: "Already reported. Thanks." };
  const rl = await rateLimit(`report:${userId}`, cfg.moderation.reportsPerDay, DAY_MS);
  if (!rl.ok) return { ok: false, error: `You can file ${cfg.moderation.reportsPerDay} reports a day.`, status: 429 };
  await db.report.create({ data: { id: randomUUID(), reporterId: userId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, note: input.note } });
  const reporters = await db.report.count({ where: { targetType: input.targetType, targetId: input.targetId, status: { not: "kept" } } });
  if (reporters >= cfg.moderation.autoHideAt) await hideTarget(input.targetType, input.targetId, true);
  return { ok: true, message: reporters >= cfg.moderation.autoHideAt ? "Reported. It is hidden pending review." : "Reported. A human will look." };
}

/** Hidden items: posts flip a column; other targets are hidden while they have >= autoHideAt open reports. */
export async function hideTarget(targetType: string, targetId: string, hidden: boolean): Promise<void> {
  const db = await prisma();
  if (targetType === "post") await db.post.updateMany({ where: { id: targetId }, data: { hidden } });
}

export async function isHidden(targetType: string, targetId: string): Promise<boolean> {
  const cfg = loadGameConfig();
  const db = await prisma();
  const n = await db.report.count({ where: { targetType, targetId, status: "open" } });
  return n >= cfg.moderation.autoHideAt;
}

export async function reviewReports(targetType: string, targetId: string, decision: "keep" | "remove"): Promise<void> {
  const db = await prisma();
  await db.report.updateMany({ where: { targetType, targetId }, data: { status: decision === "keep" ? "kept" : "removed" } });
  await hideTarget(targetType, targetId, decision === "remove");
  if (decision === "remove" && targetType === "card") await db.card.updateMany({ where: { id: targetId }, data: { deletedAt: new Date() } });
}
