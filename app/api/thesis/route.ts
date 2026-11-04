import type { NextRequest } from "next/server";
import { z } from "zod";
import { RED_FLAGS, SECTOR_IDS, STAGES } from "@/config/game";
import { currentUser } from "@/lib/server/session";
import { saveThesis } from "@/lib/server/actions";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";

const list = <T extends readonly string[]>(vals: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : v), z.array(z.string().max(80)).max(20)).transform((xs) => xs.map((x) => x.toLowerCase().replace(/[\s-]+/g, "_")).map((x) => (x === "ai" || x === "ai_infra" ? "ai_infra" : x === "series_a" || x === "a" ? "seriesA" : x === "pre_seed" ? "preseed" : x)).filter((x): x is T[number] => (vals as readonly string[]).includes(x)));
const scrip = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v), z.number().int().positive().max(1e10));

const Body = z.object({
  text: z.string().max(20_000),
  sectors: list(SECTOR_IDS),
  stages: list(STAGES),
  checkMin: scrip,
  checkMax: scrip,
  redFlags: list(RED_FLAGS).default([]),
  redFlagLines: z.string().max(1000).default(""),
  style: z.string().max(400).default(""),
});

export async function POST(req: NextRequest) {
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, "/create?tab=vc");
  const b = Body.safeParse(raw);
  if (!b.success) return respond(req, false, { error: `Check the ${String(b.error.issues[0]?.path[0] ?? "form")} field.` }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to edit a thesis." }, `/signin?next=${encodeURIComponent(back)}`, 401);
  const r = await saveThesis(user.id, { ...b.data, redFlagLines: b.data.redFlagLines.split(/\n|\.\s/).map((x) => x.trim()).filter(Boolean) });
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status ?? 400);
}
