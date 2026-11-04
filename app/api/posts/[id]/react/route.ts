import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { reactToPost } from "@/lib/server/social-actions";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";
const Body = z.object({ kind: z.enum(["cosign", "roast"]), back: z.string().max(300).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, "/wire");
  const b = Body.safeParse(raw);
  if (!b.success) return respond(req, false, { error: "Pick Cosign or Roast back." }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to react." }, back, 401);
  const r = await reactToPost(user.id, z.string().max(64).parse(id), b.data.kind);
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status);
}
