import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { exitAction } from "@/lib/server/actions";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";
const Body = z.object({ choice: z.enum(["accept", "decline"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ exitId: string }> }) {
  const { exitId } = await params;
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, "/floor");
  const b = Body.safeParse(raw);
  if (!b.success) return respond(req, false, { error: "Sell or decline." }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to decide." }, `/signin?next=${encodeURIComponent(back)}`, 401);
  const r = await exitAction(user.id, z.string().max(64).parse(exitId), b.data.choice);
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status ?? 400);
}
