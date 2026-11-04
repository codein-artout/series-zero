import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { meetingAction } from "@/lib/server/actions";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";
const Body = z.object({ ref: z.string().min(1).max(80), companyId: z.string().min(1).max(64) });

export async function POST(req: NextRequest) {
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, "/floor");
  const b = Body.safeParse(raw);
  if (!b.success) return respond(req, false, { error: "Pick a founder." }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to take meetings." }, `/signin?next=${encodeURIComponent(back)}`, 401);
  const r = await meetingAction(user.id, b.data.ref, b.data.companyId);
  if (r.ok && r.pitchId) return respond(req, true, { message: r.message, pitchId: r.pitchId }, `/pitch/${r.pitchId}`);
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status ?? 400);
}
