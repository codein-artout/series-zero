import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { advance } from "@/lib/server/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({ to: z.coerce.number().int().positive().optional() });

/** Cron-ready tick. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Idempotent per tick with ?to=N. */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "Bad query" }, { status: 400 });
  const res = await advance(q.data.to ? { toTick: q.data.to } : { count: 1 });
  return NextResponse.json({ season: res.season, tick: res.tick, ran: res.ran.map((r) => ({ tick: r.number, digest: r.digest })), skipped: res.skipped });
}

export const GET = handle;
export const POST = handle;
