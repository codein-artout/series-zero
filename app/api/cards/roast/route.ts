import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { createRoastCard } from "@/lib/server/cards";
import { readBody, respond } from "@/lib/server/http";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";
const Body = z.object({ pitchId: z.string().min(1).max(64), fundId: z.string().min(1).max(64) });

export async function POST(req: NextRequest) {
  const b = Body.safeParse(await readBody(req));
  if (!b.success) return respond(req, false, { error: "Pick a fund." }, "/cards");
  const back = `/pitch/${b.data.pitchId}`;
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to share." }, `/signin?next=${encodeURIComponent(back)}`, 401);
  const db = await prisma();
  const founders = await db.founder.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const ids = new Set(founders.map((f) => f.id));
  const r = await createRoastCard(user.id, b.data.pitchId, b.data.fundId, (fid) => ids.has(fid));
  return r.ok ? respond(req, true, { message: "Card ready.", id: r.id }, `/cards/${r.id}`) : respond(req, false, { error: r.error }, back, 403);
}
