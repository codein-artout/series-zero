import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";

export interface Viewer {
  id: string;
  name: string | null;
  email: string | null;
  isGuest: boolean;
  isAdmin: boolean;
}

export async function currentUser(): Promise<Viewer | null> {
  const s = await auth().catch(() => null);
  const id = (s?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const db = await prisma();
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, isGuest: u.isGuest, isAdmin: u.isAdmin || isAdminEmail(u.email) || openAdmin() };
}

function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** Admin is open to any signed-in user in development and in e2e runs. */
export function openAdmin(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SZ_OPEN_ADMIN === "1";
}

export const ANON_COOKIE = "sz_anon";

/** Anonymous visitor token (for the no-signup hook). Readable in server components; set in route handlers. */
export async function anonToken(): Promise<string | null> {
  return (await cookies()).get(ANON_COOKIE)?.value ?? null;
}

export function newAnonToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "local").split(",")[0].trim();
  return createHash("sha256").update(`${process.env.AUTH_SECRET ?? "sz"}|${ip}`).digest("hex").slice(0, 32);
}
