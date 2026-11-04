import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { advance } from "@/lib/server/world";
import { readBody, respond } from "@/lib/server/http";

export const runtime = "nodejs";
const Body = z.object({ count: z.coerce.number().int().min(1).max(270).default(1) });

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user?.isAdmin) return respond(req, false, { error: "Admins only." }, "/admin", 403);
  const b = Body.safeParse(await readBody(req));
  if (!b.success) return respond(req, false, { error: "Count must be 1 to 270." }, "/admin");
  const r = await advance({ count: b.data.count });
  return respond(req, true, { message: r.skipped ? `Nothing to run. Tick ${r.tick}.` : `Advanced to tick ${r.tick}.`, tick: r.tick }, "/admin");
}
