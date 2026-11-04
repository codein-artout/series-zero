import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AMBITIONS } from "@/config/game";
import { spawnFromHook } from "@/lib/server/actions";
import { ANON_COOKIE, clientIpHash, currentUser, newAnonToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  sentence: z.string().min(1).max(2000),
  url: z.string().max(2000).optional().default(""),
  ambition: z.enum(AMBITIONS).default("moonshot"),
});

export async function POST(req: NextRequest) {
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ ok: false, error: "Describe your startup in one sentence." }, { status: 400 });
  const user = await currentUser();
  const token = req.cookies.get(ANON_COOKIE)?.value ?? newAnonToken();
  const r = await spawnFromHook(b.data, { userId: user?.id ?? null, anonToken: user ? null : token, ipHash: await clientIpHash() });
  const res = NextResponse.json(r, { status: r.ok ? 200 : (r.status ?? 400) });
  if (!user && !req.cookies.get(ANON_COOKIE)) res.cookies.set(ANON_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  return res;
}
