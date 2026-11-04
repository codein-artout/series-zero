import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { reviewReports } from "@/lib/server/reports";
import { readBody, respond } from "@/lib/server/http";

export const runtime = "nodejs";
const Body = z.object({ targetType: z.string().max(20), decision: z.enum(["keep", "remove"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user?.isAdmin) return respond(req, false, { error: "Admins only." }, "/admin", 403);
  const b = Body.safeParse(await readBody(req));
  if (!b.success) return respond(req, false, { error: "Keep or remove." }, "/admin");
  await reviewReports(b.data.targetType, z.string().max(80).parse(id), b.data.decision);
  return respond(req, true, { message: b.data.decision === "keep" ? "Kept." : "Removed." }, "/admin");
}
