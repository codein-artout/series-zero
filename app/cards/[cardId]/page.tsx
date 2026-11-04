import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink, ShareCard } from "@/components/ui";
import { Flash, Page } from "@/components/game/page";
import { ReportButton } from "@/components/game/report";
import { getCard } from "@/lib/server/cards";
import { getPerspective } from "@/lib/server/view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ cardId: string }> }): Promise<Metadata> {
  const { cardId } = await params;
  const card = await getCard(cardId);
  if (!card) return { title: "Card not found" };
  const desc = "Simulation. Fictional founders and funds. Not investment advice.";
  return {
    title: card.title,
    description: desc,
    openGraph: { title: card.title, description: desc, images: [{ url: `/cards/${cardId}/image?size=link`, width: 1200, height: 630 }], type: "article" },
    twitter: { card: "summary_large_image", title: card.title, description: desc, images: [`/cards/${cardId}/image?size=link`] },
  };
}

export default async function CardPage({ params, searchParams }: { params: Promise<{ cardId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { cardId } = await params;
  const sp = await searchParams;
  const card = await getCard(cardId);
  if (!card) notFound();
  const p = await getPerspective();
  const owner = p.canAct && card.ownerId === p.userId;
  const kindLabel = card.kind === "term_sheet" ? "Term sheet card" : card.kind === "roast" ? "Rejection roast card" : "Exit announcement card";
  return (
    <Page active="cards">
      <div>
        <div className="lbl">{kindLabel} · exported at 1080 × 1350, shown here at 430 × 538</div>
        <h1 className="h1 page-title" style={{ fontSize: 44, marginTop: 6 }}>
          {card.title}
        </h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="cols">
        <div style={{ flex: "0 1 430px", minWidth: 0 }}>
          <ShareCard data={card.data} />
        </div>
        <section className="card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="share">
          <h2 id="share" className="lbl">
            Share
          </h2>
          <p className="mut">Every card carries the simulation label. Fictional names only.</p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <ButtonLink href={`/cards/${cardId}/image?size=post`} prefetch={false}>
              Image 1080 × 1350
            </ButtonLink>
            <ButtonLink variant="ghost" href={`/cards/${cardId}/image?size=link`} prefetch={false}>
              Link preview 1200 × 630
            </ButtonLink>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            {owner ? (
              <form method="post" action={`/api/cards/${cardId}/delete`}>
                <button type="submit" className="btn red">
                  Delete card
                </button>
              </form>
            ) : null}
            <ReportButton targetType="card" targetId={cardId} back={`/cards/${cardId}`} />
          </div>
        </section>
      </div>
    </Page>
  );
}
