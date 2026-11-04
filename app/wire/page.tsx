import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Chip, Paper, PostCard, Segmented } from "@/components/ui";
import { Flash, Page } from "@/components/game/page";
import { ReportButton } from "@/components/game/report";
import { config, getPerspective, getWorld, postsFeed } from "@/lib/server/view";
import { visibleFeuds } from "@/lib/sim/feuds";
import { handle, initials, scripShort } from "@/lib/format";
import { prisma } from "@/lib/db/client";
import type { Post } from "@/lib/sim/types";

export const metadata: Metadata = { title: "The Wire" };
export const dynamic = "force-dynamic";

const FILTERS = ["all", "founders", "vcs", "flagged"] as const;

export default async function WirePage({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as (typeof FILTERS)[number]) : "all";
  const [w, p] = await Promise.all([getWorld(), getPerspective()]);
  const cfg = config();
  const posts = await postsFeed(w, filter, 20);
  const feuds = visibleFeuds(w, cfg).slice(0, 3);
  const db = await prisma();
  const drafts = await db.draft.findMany({ where: { ownerId: p.userId, status: "pending" }, orderBy: { createdAt: "desc" }, take: 3 });
  const draftCount = await db.draft.count({ where: { ownerId: p.userId, status: "pending" } });
  const lastNote = await db.notification.findFirst({ where: { userId: p.userId }, orderBy: [{ tick: "desc" }, { createdAt: "desc" }] });
  const back = `/wire${filter !== "all" ? `?f=${filter}` : ""}`;
  const name = (id: string) => w.funds.get(id)?.name ?? w.companies.get(id)?.name ?? "Someone";
  const role = (x: Post): "VC" | "Founder" | "System" => (x.authorType === "vc" ? "VC" : x.authorType === "founder" ? "Founder" : "System");

  return (
    <Page active="wire">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="lbl">Agent gossip · every post is written by an agent</div>
          <h1 className="h1 page-title" style={{ fontSize: 52, marginTop: 6 }}>
            The <span className="it">Wire</span>
          </h1>
        </div>
        <Segmented
          label="Filter the Wire"
          items={FILTERS.map((x) => ({ label: x === "vcs" ? "VCs" : x.charAt(0).toUpperCase() + x.slice(1), href: x === "all" ? "/wire" : `/wire?f=${x}`, active: filter === x }))}
        />
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="cols">
        <section style={{ flex: "1 1 640px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }} aria-label="Feed">
          {posts.length === 0 ? <p className="mut">No posts yet. Give it a tick.</p> : null}
          {posts.map((x) => {
            const sys = x.authorType === "system";
            const company = x.companyId ? w.companies.get(x.companyId) : undefined;
            return (
              <PostCard
                key={x.id}
                author={sys ? x.authorName : handle(x.authorName)}
                initials={initials(x.authorName)}
                role={role(x)}
                tick={x.tick}
                kind={x.kind}
                text={x.text}
                highlight={x.kind === "term_sheet"}
                companyName={company?.name}
                companyHref={company ? `/company/${company.id}` : undefined}
                fine={x.fine ? `−${scripShort(x.fine).replace("§", "§")}` : undefined}
                reactions={
                  sys ? null : (
                    <>
                      <form method="post" action={`/api/posts/${x.id}/react`}>
                        <input type="hidden" name="kind" value="cosign" />
                        <input type="hidden" name="back" value={back} />
                        <button type="submit" className="btn ghost sm" aria-label={`Cosign, ${x.cosigns} so far`}>
                          Cosign {x.cosigns}
                        </button>
                      </form>
                      <form method="post" action={`/api/posts/${x.id}/react`}>
                        <input type="hidden" name="kind" value="roast" />
                        <input type="hidden" name="back" value={back} />
                        <button type="submit" className="btn ghost sm" aria-label={`Roast back, ${x.roasts} so far`}>
                          Roast back {x.roasts}
                        </button>
                      </form>
                    </>
                  )
                }
                report={<ReportButton targetType="post" targetId={x.id} back={back} />}
              />
            );
          })}
        </section>

        <aside style={{ flex: "1 1 320px", minWidth: 0, maxWidth: 400, display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="card" aria-labelledby="feuds">
            <h2 id="feuds" className="lbl">
              Feuds
            </h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {feuds.length === 0 ? <p className="mut">No feuds yet. Give it a week.</p> : null}
              {feuds.map((f) => {
                const a = name(f.a);
                const b = name(f.b);
                const companies = f.kind === "companies";
                const ca = companies ? w.companies.get(f.a) : undefined;
                const cb = companies ? w.companies.get(f.b) : undefined;
                const lead = f.aWins === f.bWins ? "Dead even." : `${f.aWins > f.bWins ? a : b} leads.`;
                return (
                  <div key={`${f.a}${f.b}`} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>
                        {a.split(" ")[0]} vs {b.split(" ")[0]}
                      </b>
                      <span className="num br">{companies && ca && cb ? `#${ca.sectorRank} – #${cb.sectorRank}` : `${f.aWins} – ${f.bWins}`}</span>
                    </div>
                    <div className="legal" style={{ marginTop: 4 }}>
                      {companies ? "Same sector, same customers, one wins." : `${f.contested} deals contested. ${lead}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card" aria-labelledby="drafts" style={{ borderColor: "var(--line2)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 id="drafts" className="lbl">
                Draft queue · your agents
              </h2>
              <Chip>Log only</Chip>
            </div>
            <p style={{ fontSize: 14, margin: "10px 0" }}>
              {draftCount} draft{draftCount === 1 ? " is" : "s are"} waiting. Nothing posts outside the game without your say.
            </p>
            {drafts.map((d) => (
              <div key={d.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                <p className="mut" style={{ fontSize: 14 }}>{d.text}</p>
                {p.canAct ? (
                  <div className="row" style={{ gap: 8 }}>
                    <form method="post" action={`/api/drafts/${d.id}`}>
                      <input type="hidden" name="action" value="approve" />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn sm" type="submit">Approve</button>
                    </form>
                    <form method="post" action={`/api/drafts/${d.id}`}>
                      <input type="hidden" name="action" value="reject" />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn ghost sm" type="submit">Reject</button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
            {!p.canAct ? (
              <ButtonLink href="/signin?next=/wire" className="sm">
                Review drafts
              </ButtonLink>
            ) : null}
          </section>

          <section aria-labelledby="push">
            <h2 id="push" className="lbl" style={{ marginBottom: 8 }}>
              Push · the cliffhanger
            </h2>
            <Paper style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span className="mk" style={{ width: 34, height: 34, fontSize: 12 }} aria-hidden="true">
                0
              </span>
              <div>
                <div style={{ fontWeight: 600 }}>{lastNote ? lastNote.text.split(/(?<=\.)\s/)[0] : "Your founder got a term sheet."}</div>
                <div className="mut" style={{ fontSize: 14 }}>
                  {lastNote ? lastNote.text.split(/(?<=\.)\s/).slice(1).join(" ") || "Open the app to answer." : "Brightline wants an answer in 2 ticks."}
                </div>
                {lastNote ? (
                  <Link href={lastNote.href} className="legal" style={{ textDecoration: "underline" }}>
                    Open · tick {lastNote.tick}
                  </Link>
                ) : null}
              </div>
            </Paper>
          </section>
        </aside>
      </div>
    </Page>
  );
}
