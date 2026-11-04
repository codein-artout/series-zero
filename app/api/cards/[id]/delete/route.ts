import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { deleteCard } from "@/lib/server/cards";
import { respond } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in first." }, "/signin", 401);
  const ok = await deleteCard(user.id, z.string().max(64).parse(id));
  return ok ? respond(req, true, { message: "Card deleted." }, "/cards") : respond(req, false, { error: "Not your card." }, `/cards/${id}`, 403);
}
