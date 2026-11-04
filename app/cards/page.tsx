import type { Metadata } from "next";
import Link from "next/link";
import { ShareCard } from "@/components/ui";
import { Page } from "@/components/game/page";
import { getCard } from "@/lib/server/cards";
import { getPerspective } from "@/lib/server/view";
import { prisma } from "@/lib/db/client";

export const metadata: Metadata = { title: "Cards" };
export const dynamic = "force-dynamic";

export default async function CardsIndex() {
  const p = await getPerspective();
  const db = await prisma();
  const mine = await db.card.findMany({ where: { ownerId: p.userId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 6 });
  const recent = mine.length >= 3 ? [] : await db.card.findMany({ where: { deletedAt: null, OR: [{ ownerId: null }, { ownerId: { not: p.userId } }] }, orderBy: { createdAt: "desc" }, take: 6 });
  const pick = [...mine, ...recent];
  const kinds = new Map<string, (typeof pick)[number]>();
  for (const c of pick) if (!kinds.has(c.kind)) kinds.set(c.kind, c);
  const shown = (await Promise.all([...new Set([...kinds.values(), ...pick])].slice(0, 6).map((c) => getCard(c.id)))).filter((c) => c !== null);
  return (
    <Page active="cards">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <div className="lbl">Shareable cards · exported at 1080 × 1350, shown here at 430 × 538</div>
          <h1 className="h1 page-title" style={{ fontSize: 44, marginTop: 6 }}>
            Three ways to <span className="it">be seen</span>
          </h1>
        </div>
        <span className="legal">Every card carries the simulation label. Fictional names only.</span>
      </div>
      {shown.length === 0 ? <p className="mut">No cards yet. Close a round or get roasted.</p> : null}
      <div className="wrap" style={{ gap: 35, justifyContent: "center" }}>
        {shown.map((c) => (
          <Link key={c.id} href={`/cards/${c.id}`} style={{ display: "block", width: 430, maxWidth: "100%" }}>
            <div className="lbl" style={{ marginBottom: 8 }}>
              {c.kind === "term_sheet" ? "Term sheet card" : c.kind === "roast" ? "Rejection roast card" : "Exit announcement card"}
              {mine.some((m) => m.id === c.id) ? " · yours" : ""}
            </div>
            <ShareCard data={c.data} />
          </Link>
        ))}
      </div>
    </Page>
  );
}
