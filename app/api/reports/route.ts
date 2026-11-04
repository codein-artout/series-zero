import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/server/session";
import { fileReport, ReportInput } from "@/lib/server/reports";
import { readBody, respond, safeBack } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await readBody(req);
  const back = safeBack(req, raw.back, "/wire");
  const p = ReportInput.safeParse(raw);
  if (!p.success) return respond(req, false, { error: p.error.issues[0]?.path.join(".") === "note" ? "Notes are 280 characters at most." : "Pick a reason." }, back);
  const user = await currentUser();
  if (!user) return respond(req, false, { error: "Sign in to report." }, back, 401);
  const r = await fileReport(user.id, p.data);
  return r.ok ? respond(req, true, { message: r.message }, back) : respond(req, false, { error: r.error }, back, r.status);
}
