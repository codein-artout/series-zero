/** Share cards: built from stored records only; every text field is re-moderated at render time. */
import { randomBytes } from "node:crypto";
import { loadGameConfig } from "@/config/load";
import { prisma } from "@/lib/db/client";
import { moderateSync } from "@/lib/providers/moderation";
import { realNameHit } from "@/lib/safety/realnames";
import { cleanField, truncate } from "@/lib/safety/sanitize";
import type { ShareCardData } from "@/components/ui/share-card";
import { multiple, pct, scripFull, scripShort } from "@/lib/format";
import { isHidden } from "./reports";
import type { Pitch } from "@/lib/sim/types";

export interface CardView {
  id: string;
  kind: "term_sheet" | "roast" | "exit";
  ownerId: string | null;
  data: ShareCardData;
  title: string;
}

function safe(text: string, max: number, fallback: string): string {
  const t = cleanField(String(text ?? ""), 2000);
  if (!t || !moderateSync(t).allowed || realNameHit(t).hit) return fallback;
  return truncate(t, max);
}

export async function getCard(id: string): Promise<CardView | null> {
  if (!/^[0-9a-zA-Z_-]{16,40}$/.test(id)) return null;
  const db = await prisma();
  const row = await db.card.findUnique({ where: { id } });
  if (!row || row.deletedAt) return null;
  if (await isHidden("card", id)) return null;
  const cfg = loadGameConfig();
  const d = row.data as Record<string, string | number>;
  if (row.kind === "term_sheet") {
    const data: ShareCardData = {
      kind: "term_sheet",
      season: Number(d.season ?? 1),
      investor: safe(String(d.investor), 40, "A fictional fund"),
      company: safe(String(d.company), 32, "a fictional company"),
      preMoney: scripFull(Number(d.preMoney)),
      check: scripFull(Number(d.check)),
      ownership: pct(Number(d.ownership)),
      liqPref: safe(String(d.liqPref), 30, "1x non-participating"),
      board: safe(String(d.board), 20, "1 observer"),
      signature: safe(String(d.signature).replace(/^(\w)\w*\s+/, "$1. "), 26, "The founder"),
    };
    return { id, kind: "term_sheet", ownerId: row.ownerId, data, title: `${data.investor} invests in ${data.company}` };
  }
  if (row.kind === "roast") {
    const data: ShareCardData = {
      kind: "roast",
      vc: safe(String(d.vc), 40, "A fictional fund"),
      interest: Number(d.interest).toFixed(2),
      quote: safe(String(d.quote).replace(/^["“]|["”]$/g, ""), cfg.cards.quoteMax, "Not for us. Not right now."),
      company: safe(String(d.company), 32, "a fictional company"),
      stage: String(d.stage ?? "Seed"),
      ask: scripShort(Number(d.ask)),
    };
    return { id, kind: "roast", ownerId: row.ownerId, data, title: `${data.vc} passed on ${data.company}` };
  }
  const data: ShareCardData = {
    kind: "exit",
    tick: Number(d.tick),
    price: scripShort(Number(d.price), 0),
    company: safe(String(d.company), 32, "A fictional company"),
    acquirer: String(d.label) === "IPO" ? "listed on the public market" : `acquired by ${safe(String(d.acquirer), 32, "a fictional acquirer")}`,
    label: String(d.label ?? "Acquired"),
    lead: safe(String(d.lead), 32, "Bootstrapped"),
    multiple: multiple(Number(d.multiple ?? 0)),
  };
  return { id, kind: "exit", ownerId: row.ownerId, data, title: `${data.company} ${data.acquirer}` };
}

export function newCardId(): string {
  return randomBytes(15).toString("base64url").replace(/[^0-9a-zA-Z]/g, "x").slice(0, 20);
}

/** Rejection roast card, created on demand by the founder's coach from a stored pitch. */
export async function createRoastCard(userId: string, pitchId: string, fundId: string, ownsFounder: (founderId: string) => boolean): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = await prisma();
  const row = await db.pitch.findUnique({ where: { id: pitchId } });
  if (!row) return { ok: false, error: "Unknown pitch." };
  const p = row.state as unknown as Pitch;
  if (!ownsFounder(p.founderId)) return { ok: false, error: "Only the founder's coach can share this roast." };
  const r = p.reactions.find((x) => x.fundId === fundId && !x.offer);
  if (!r) return { ok: false, error: "That fund did not pass." };
  const existing = await db.card.findFirst({ where: { kind: "roast", refId: `${pitchId}:${fundId}`, deletedAt: null } });
  if (existing) return { ok: true, id: existing.id };
  const fund = await db.fund.findUnique({ where: { id: fundId } });
  const co = await db.company.findUnique({ where: { id: p.companyId } });
  const id = newCardId();
  await db.card.create({
    data: { id, kind: "roast", refId: `${pitchId}:${fundId}`, ownerId: userId, data: { vc: fund?.name ?? "A fund", interest: r.interest, quote: r.text, company: co?.name ?? "A company", stage: p.stage === "seriesA" ? "Series A" : p.stage === "preseed" ? "Pre-seed" : "Seed", ask: p.ask, tick: p.tick } },
  });
  return { ok: true, id };
}

export async function deleteCard(userId: string, id: string): Promise<boolean> {
  const db = await prisma();
  const row = await db.card.findUnique({ where: { id } });
  if (!row || row.ownerId !== userId || row.deletedAt) return false;
  await db.card.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}
