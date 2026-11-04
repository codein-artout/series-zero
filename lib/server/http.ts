import { NextResponse, type NextRequest } from "next/server";

/** Reads JSON or form bodies. */
export async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return ((await req.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
  const fd = await req.formData().catch(() => null);
  return fd ? Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])) : {};
}

export function wantsJson(req: NextRequest): boolean {
  return (req.headers.get("accept") ?? "").includes("application/json") || (req.headers.get("content-type") ?? "").includes("application/json");
}

/** Same-origin relative redirect target, defaulting to `fallback`. */
export function safeBack(req: NextRequest, value: unknown, fallback: string): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

export function respond(req: NextRequest, ok: boolean, payload: Record<string, unknown>, back: string, status = ok ? 200 : 400): NextResponse {
  if (wantsJson(req)) return NextResponse.json(payload, { status });
  const url = new URL(back, req.url);
  url.searchParams.set(ok ? "ok" : "err", String(payload.message ?? payload.error ?? ""));
  return NextResponse.redirect(url, 303);
}
