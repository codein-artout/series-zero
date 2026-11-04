import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { playerPitch } from "@/lib/server/actions";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";
const Body = z.object({ note: z.string().max(280).default("") });

export async function POST(req: NextRequest) {
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, "/floor");
  const b = Body.safeParse(raw);
  if (!b.success) return respond(req, false, { error: "Notes are 280 characters at most." }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to pitch." }, `/signin?next=${encodeURIComponent(back)}`, 401);
  const r = await playerPitch(user.id, b.data.note);
  if (r.ok && r.pitchId) return respond(req, true, { message: r.message, pitchId: r.pitchId }, `/pitch/${r.pitchId}`);
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status ?? 400);
}
