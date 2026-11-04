import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bar, CapTable, Chip, MarginNote, Paper, SignatureLine, Stamp, TermTable } from "@/components/ui";
import { Flash, Page } from "@/components/game/page";
import { config, getPerspective, getWorld } from "@/lib/server/view";
import { prisma } from "@/lib/db/client";
import { dilute } from "@/lib/rules/terms";
import { pct, scripFull, scripShort, ticksLabel } from "@/lib/format";
import type { Company, Offer } from "@/lib/sim/types";

export const metadata: Metadata = { title: "Term Sheet" };
export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGH";

export default async function OfferPage({ params, searchParams }: { params: Promise<{ offerId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { offerId } = await params;
  const sp = await searchParams;
  const [w, p] = await Promise.all([getWorld(), getPerspective()]);
  const cfg = config();
  const db = await prisma();
  const o = w.offers.get(offerId) ?? ((await db.offer.findUnique({ where: { id: offerId } }))?.state as unknown as Offer | undefined);
  if (!o) notFound();
  const c = w.companies.get(o.companyId) ?? ((await db.company.findUnique({ where: { id: o.companyId } }))?.state as unknown as Company | undefined);
  const f = w.funds.get(o.fundId);
  if (!c || !f) notFound();
  const founder = w.founders.get(c.founderId);
  const mine = founder?.ownerId === p.userId;
  const canAct = mine && p.canAct && o.status === "open";
  const live = [...w.offers.values()].filter((x) => x.companyId === c.id && x.status === "open").sort((a, b) => (a.id < b.id ? -1 : 1));
  const idx = Math.max(0, live.findIndex((x) => x.id === o.id));
  const others = live.filter((x) => x.id !== o.id);
  const left = o.expiresTick - w.season.tick;
  const capNow = c.capTable;
  const capAfter = o.status === "open" ? dilute(capNow, o.check, o.preMoney, { id: f.id, name: f.name }) : capNow;
  const rows = capAfter.map((x) => ({ holder: x.name, now: capNow.find((y) => y.name === x.name && y.holderId === x.holderId)?.share ?? null, after: x.share, investor: x.holderId === f.id }));
  const stage = o.check >= 2_000_000 ? "Series A financing" : "Seed financing";
  const statusStamp = o.status === "open" ? "Offer" : o.status === "accepted" ? "Signed" : o.status === "declined" ? "Declined" : o.status === "lapsed" ? "Lapsed" : o.status === "pulled" ? "Pulled" : "Superseded";
  const back = `/offers/${o.id}`;
  const counterCheck = o.counters.length ? o.counters[o.counters.length - 1].check : Math.round((o.check * 1.25) / 50_000) * 50_000;
  const counterPre = o.counters.length ? o.counters[o.counters.length - 1].preMoney : Math.round((o.preMoney * 1.2) / 100_000) * 100_000;
  const inputStyle: React.CSSProperties = { width: 130 };

  return (
    <Page active="founder">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="lbl">
            Negotiation · Offer {LETTERS[idx] ?? idx + 1} of {Math.max(1, live.length)}
          </div>
          <h1 className="h1 page-title" style={{ fontSize: 48, marginTop: 6 }}>
            The <span className="it">Term Sheet</span>
          </h1>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {o.status === "open" ? <Chip variant="down">Lapses in {ticksLabel(left)}</Chip> : <Chip>{statusStamp}</Chip>}
          <Chip variant="brass">{f.name}</Chip>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="cols">
        <Paper as="article" arrive style={{ flex: "1 1 640px", minWidth: 0, padding: "40px 44px 36px" }} aria-label="Term sheet">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="lbl">Summary of proposed terms · {stage}</div>
              <h2 className="h1" style={{ fontSize: 44, marginTop: 8, color: "var(--ink)" }}>
                {c.name}, Inc.
              </h2>
              <div className="mut" style={{ marginTop: 4 }}>
                A fictional company. A fictional fund. A very real runway.
              </div>
            </div>
            <Stamp variant={o.status === "open" || o.status === "accepted" ? "brass" : "red"} style={{ marginTop: 6 }}>
              {statusStamp}
            </Stamp>
          </div>
          <hr className="hair" style={{ margin: "22px 0 6px" }} />
          <form id="terms" method="post" action={`/api/offers/${o.id}`}>
            <input type="hidden" name="back" value={back} />
            <div className="tbl-box" tabIndex={0} role="region" aria-label="Proposed terms">
              <TermTable
                showCounter={o.status === "open"}
                rows={[
                  {
                    no: "1.1",
                    term: "Investment",
                    offered: scripFull(o.check),
                    counter: canAct ? (
                      <>
                        <label className="sr-only" htmlFor="counter-check">
                          Counter investment
                        </label>
                        <input id="counter-check" name="check" className="counter-input num" type="text" inputMode="numeric" defaultValue={scripFull(counterCheck)} style={inputStyle} />
                      </>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    no: "1.2",
                    term: "Pre-money valuation",
                    offered: scripFull(o.preMoney),
                    counter: canAct ? (
                      <>
                        <label className="sr-only" htmlFor="counter-pre">
                          Counter valuation
                        </label>
                        <input id="counter-pre" name="preMoney" className="counter-input num" type="text" inputMode="numeric" defaultValue={scripFull(counterPre)} style={inputStyle} />
                      </>
                    ) : (
                      "—"
                    ),
                  },
                  { no: "1.3", term: "Post-money valuation", offered: scripFull(o.postMoney), counter: "auto" },
                  { no: "2.1", term: "Liquidation preference", offered: o.liqPref },
                  { no: "2.2", term: "Board", offered: o.board === "seat" ? "1 board seat" : "1 observer seat" },
                  { no: "2.3", term: "Pro-rata rights", offered: o.proRata ? "Yes" : "No" },
                  { no: "3.1", term: "Option pool", offered: `${Math.round(o.optionPool * 100)}% post-money` },
                  { no: "3.2", term: "Exclusivity", offered: ticksLabel(cfg.offer.exclusivityTicks) },
                ]}
              />
            </div>
          </form>
          <div style={{ margin: "22px 0 6px" }}>
            <MarginNote text={o.note.replace(/^Counter \d accepted\. /, "")} by={f.name.split(" ")[0]} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40, marginTop: 30 }}>
            <SignatureLine signature={f.name} label="Lead investor" />
            <SignatureLine signature={o.status === "accepted" ? founder?.name : undefined} label={o.status === "accepted" ? "Founder · signed" : "Founder · sign here"} />
          </div>
        </Paper>

        <aside style={{ flex: "1 1 380px", minWidth: 0, maxWidth: 460, display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="card accent" aria-labelledby="call">
            <h2 id="call" className="lbl">
              Your call
            </h2>
            {o.status !== "open" ? (
              <p className="mut" style={{ marginTop: 12 }}>
                This offer is {statusStamp.toLowerCase()}. <Link className="br" style={{ textDecoration: "underline" }} href={`/company/${c.id}`}>Back to {c.name}</Link>.
              </p>
            ) : canAct ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                <button type="submit" form="terms" name="action" value="accept" className="btn">
                  Accept offer {LETTERS[idx] ?? ""}
                </button>
                <button type="submit" form="terms" name="action" value="counter" className="btn ghost" disabled={o.counters.length >= cfg.negotiation.maxCounters}>
                  Send counter · {cfg.negotiation.maxCounters - o.counters.length} left
                </button>
                <button type="submit" form="terms" name="action" value="decline" className="btn red">
                  Decline
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                <p className="mut">{mine ? "Sign in as this founder's coach to answer." : "This offer is for another founder. Watch it play out."}</p>
                {mine ? (
                  <Link className="btn" href={`/signin?next=${encodeURIComponent(back)}`}>
                    Sign in to answer
                  </Link>
                ) : null}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="lbl">{f.name.split(" ")[0]} patience</span>
                <span className="num">{Math.round(Math.max(0, o.patience) * 100)}%</span>
              </div>
              <Bar value={o.patience} label={`${f.name} patience ${Math.round(Math.max(0, o.patience) * 100)} percent`} style={{ marginTop: 6 }} />
            </div>
            {o.counters.length ? (
              <ul className="legal" style={{ marginTop: 10, paddingLeft: 16 }}>
                {o.counters.map((k) => (
                  <li key={k.n}>
                    Counter {k.n}: {scripShort(k.check)} at {scripShort(k.preMoney)} pre · {k.accepted ? "accepted" : "rejected"} (roll {k.roll.toFixed(2)} vs {k.A.toFixed(2)})
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="legal" style={{ marginTop: 10 }}>
              A counter can raise the offer or sour it. The roll is seeded, the temper is theirs.
            </p>
          </section>

          {others.map((x, i) => {
            const of = w.funds.get(x.fundId);
            return (
              <section key={x.id} className="card" aria-label={`Competing offer from ${of?.name}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="lbl">
                    Offer {LETTERS[live.indexOf(x)] ?? i + 2} · {of?.name}
                  </div>
                  <Chip>lapses in {ticksLabel(x.expiresTick - w.season.tick)}</Chip>
                </div>
                <table className="tbl num" style={{ marginTop: 6, fontSize: 13 }}>
                  <caption className="sr-only">Competing offer terms</caption>
                  <tbody>
                    <tr>
                      <th scope="row" className="mut" style={{ fontWeight: 400, textTransform: "none", fontSize: 13, letterSpacing: 0, fontFamily: "var(--mono)", border: 0, borderBottom: "1px solid var(--line)" }}>Check</th>
                      <td className="r">{scripShort(x.check)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="mut" style={{ fontWeight: 400, textTransform: "none", fontSize: 13, letterSpacing: 0, fontFamily: "var(--mono)", border: 0, borderBottom: "1px solid var(--line)" }}>Pre-money</th>
                      <td className="r">{scripShort(x.preMoney)}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="mut" style={{ fontWeight: 400, textTransform: "none", fontSize: 13, letterSpacing: 0, fontFamily: "var(--mono)", border: 0, borderBottom: "1px solid var(--line)" }}>Board</th>
                      <td className="r">{x.board === "seat" ? "1 seat" : "Observer"}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mut" style={{ fontSize: 14, marginTop: 8 }}>
                  {x.preMoney < o.preMoney ? "Lower price. Slower money, quieter cap table." : "Higher price. Read the board line twice."} <Link className="br" style={{ textDecoration: "underline" }} href={`/offers/${x.id}`}>Open</Link>
                </p>
              </section>
            );
          })}

          <section className="card" aria-labelledby="cap">
            <h2 id="cap" className="lbl">
              Cap table · before and after {o.status === "open" ? `offer ${LETTERS[idx] ?? ""}` : "this round"}
            </h2>
            <CapTable rows={rows} caption={`Ownership before and after ${f.name} invests ${scripShort(o.check)}; investor gets ${pct(o.ownership)}`} />
          </section>
        </aside>
      </div>
    </Page>
  );
}
