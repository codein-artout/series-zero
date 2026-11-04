import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { saveDna, setAmbition } from "@/lib/server/actions";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";
const Body = z.object({ dna: z.string().max(20_000), ambition: z.enum(["bootstrap", "lifestyle", "moonshot"]).optional() });

export async function POST(req: NextRequest) {
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, "/create");
  const b = Body.safeParse(raw);
  if (!b.success) return respond(req, false, { error: "That DNA could not be read." }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to edit DNA." }, `/signin?next=${encodeURIComponent(back)}`, 401);
  if (b.data.ambition) await setAmbition(user.id, b.data.ambition);
  const r = await saveDna(user.id, b.data.dna);
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status ?? 400);
}
