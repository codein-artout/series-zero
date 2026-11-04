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
  const latestOf = async (kind: string) => db.card.findFirst({ where: { kind, deletedAt: null }, orderBy: { createdAt: "desc" } });
  const perKind = (await Promise.all(["term_sheet", "roast", "exit"].map(latestOf))).filter((c) => c !== null);
  const ids = [...new Set([...perKind, ...mine].map((c) => c.id))].slice(0, 6);
  const shown = (await Promise.all(ids.map((id) => getCard(id)))).filter((c) => c !== null);
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
      <div className="wrap card-grid" style={{ gap: 24, justifyContent: "center" }}>
        {shown.map((c) => (
          <Link key={c.id} href={`/cards/${c.id}`} className="card-slot">
            <div className="lbl" style={{ marginBottom: 8 }}>
              {c.kind === "term_sheet" ? "Term sheet card" : c.kind === "roast" ? "Rejection roast card" : "Exit announcement card"}
              {mine.some((m) => m.id === c.id) ? " · yours" : ""}
            </div>
            <div className="card-zoom">
              <ShareCard data={c.data} />
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
