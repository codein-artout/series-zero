import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { offerAction } from "@/lib/server/actions";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";

const scrip = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v), z.number().int().positive().max(10_000_000_000));
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("counter"), check: scrip, preMoney: scrip }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, `/offers/${id}`);
  const b = Body.safeParse(raw);
  if (!b.success) return respond(req, false, { error: "Counter amounts must be whole scrip, like §1,500,000." }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to answer offers." }, `/signin?next=${encodeURIComponent(back)}`, 401);
  const r = await offerAction(user.id, z.string().max(64).parse(id), b.data.action, b.data.action === "counter" ? { check: b.data.check, preMoney: b.data.preMoney } : undefined);
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status ?? 400);
}
