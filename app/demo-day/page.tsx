import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, Paper, Podium, Segmented } from "@/components/ui";
import { Page } from "@/components/game/page";
import { config, getPerspective, getWorld, sectorName } from "@/lib/server/view";
import { prisma } from "@/lib/db/client";
import { fundBoard } from "@/lib/sim/funds";
import { multiple, scripShort } from "@/lib/format";
import type { DemoDay } from "@/lib/sim/types";

export const metadata: Metadata = { title: "Demo Day" };
export const dynamic = "force-dynamic";

export default async function DemoDayPage({ searchParams }: { searchParams: Promise<{ view?: string; n?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "vcs" ? "vcs" : sp.view === "past" ? "past" : "founders";
  const [w, p] = await Promise.all([getWorld(), getPerspective()]);
  const cfg = config();
  const db = await prisma();
  const all = (await db.demoDay.findMany({ orderBy: [{ tick: "desc" }] })).map((r) => r.state as unknown as DemoDay & { seasonId?: string });
  const chosen = sp.n ? all.find((d) => String(d.number) === sp.n) : all[0];
  const dd = chosen;
  const board = fundBoard(w, cfg);
  const myCompanies = new Set([...w.founders.values()].filter((f) => f.ownerId === p.userId).flatMap((f) => [...w.companies.values()].filter((c) => c.founderId === f.id).map((c) => c.id)));
  const entries = dd?.entries ?? [];
  const label = (id: string, lead: string) => (myCompanies.has(id) ? "your founder" : lead === "Unfunded" ? "unfunded" : `led by ${lead}`);

  return (
    <Page active="demo">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="lbl">
            Season {w.season.number} · {dd ? `Demo Day ${dd.number} · tick ${dd.tick}` : "First Demo Day on day 7"} · ranked by relative score
          </div>
          <h1 className="h1 page-title" style={{ fontSize: 64, marginTop: 6 }}>
            Demo <span className="it" style={{ color: "var(--brass2)" }}>Day</span>
          </h1>
        </div>
        <Segmented
          label="Demo Day boards"
          items={[
            { label: "Founders", href: "/demo-day", active: view === "founders" },
            { label: "VCs", href: "/demo-day?view=vcs", active: view === "vcs" },
            { label: "Past Demo Days", href: "/demo-day?view=past", active: view === "past" },
          ]}
        />
      </div>

      {entries.length >= 3 ? (
        <Podium
          entries={entries.slice(0, 3).map((e) => ({ rank: e.rank as 1 | 2 | 3, name: e.name, sub: `${sectorName(cfg, e.sector)} · ${label(e.companyId, e.lead)}`, score: e.score, href: `/company/${e.companyId}` }))}
        />
      ) : (
        <p className="mut">No Demo Day yet. The first one is on day 7, evening tick.</p>
      )}

      <div className="cols">
        <section className="card" style={{ flex: "1.6 1 640px", minWidth: 0 }} aria-labelledby="lb">
          {view === "past" ? (
            <>
              <h2 id="lb" className="lbl">
                Past Demo Days
              </h2>
              <DataTable
                caption="Past Demo Days"
                style={{ marginTop: 6 }}
                rows={all.slice(0, 12)}
                rowKey={(d) => d.id}
                columns={[
                  { key: "n", header: "#", render: (d) => <span className="num br">{d.number}</span> },
                  { key: "t", header: "Tick", numeric: true, render: (d) => d.tick },
                  { key: "w", header: "Winner", render: (d) => <b>{d.entries[0]?.name ?? "—"}</b> },
                  { key: "s", header: "Score", numeric: true, render: (d) => d.entries[0]?.score.toFixed(2) ?? "—" },
                  { key: "o", header: "Open", render: (d) => <Link href={`/demo-day?n=${d.number}`} style={{ textDecoration: "underline" }}>Board</Link> },
                ]}
              />
            </>
          ) : view === "vcs" ? (
            <>
              <h2 id="lb" className="lbl">
                Leaderboard · funds by MOIC
              </h2>
              <DataTable
                caption="Funds ranked by MOIC"
                style={{ marginTop: 6 }}
                rows={board}
                rowKey={(r) => r.id}
                columns={[
                  { key: "r", header: "#", render: (r) => <span className="num br">{board.indexOf(r) + 1}</span> },
                  { key: "n", header: "Fund", render: (r) => <Link href={`/fund/${r.id}`}><b>{r.fund.name}</b></Link> },
                  { key: "a", header: "Style", render: (r) => <span className="mut">{cfg.vc.archetypes[r.fund.archetype].label}</span> },
                  { key: "m", header: "MOIC", numeric: true, render: (r) => multiple(r.tvpi) },
                  { key: "h", header: "Hit rate", numeric: true, render: (r) => `${Math.round(r.hitRate * 100)}%` },
                  { key: "i", header: "Checks", numeric: true, render: (r) => r.investments },
                ]}
              />
            </>
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <h2 id="lb" className="lbl">
                  Leaderboard · founders
                </h2>
                <span className="legal">
                  Score = {Math.round(cfg.valuation.wGrowth * 100)}% growth · {Math.round(cfg.valuation.wScale * 100)}% scale · {Math.round(cfg.valuation.wEfficiency * 100)}% efficiency
                </span>
              </div>
              <DataTable
                caption="Founders ranked by composite score"
                style={{ marginTop: 6 }}
                rows={entries.slice(0, 12)}
                rowKey={(e) => e.companyId}
                selected={(e) => myCompanies.has(e.companyId)}
                empty={<p className="mut">No ranked companies yet.</p>}
                columns={[
                  { key: "r", header: "#", render: (e) => <span className="num br">{e.rank}</span> },
                  { key: "c", header: "Company", render: (e) => <Link href={`/company/${e.companyId}`}><b>{e.name}</b></Link> },
                  { key: "s", header: "Sector", render: (e) => <span className="mut">{sectorName(cfg, e.sector)}</span> },
                  { key: "v", header: "Valuation", numeric: true, render: (e) => scripShort(e.mark) },
                  { key: "sc", header: "Score", numeric: true, render: (e) => e.score.toFixed(2) },
                  { key: "l", header: "Lead", render: (e) => <span className="mut">{e.lead === "Unfunded" ? "Unfunded" : e.lead.split(" ")[0]}</span> },
                  { key: "m", header: "Move", numeric: true, render: (e) => (e.move > 0 ? `▲ ${e.move}` : e.move < 0 ? `▼ ${-e.move}` : "►"), className: (e) => (e.move > 0 ? "up" : e.move < 0 ? "dn" : "mut") },
                ]}
              />
            </>
          )}
        </section>

        <aside style={{ flex: "1 1 340px", minWidth: 0, maxWidth: 420, display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="card" aria-labelledby="vclb">
            <h2 id="vclb" className="lbl">
              Leaderboard · funds by MOIC
            </h2>
            <table className="tbl" style={{ marginTop: 6 }}>
              <caption className="sr-only">Top funds by MOIC</caption>
              <tbody>
                {board.slice(0, 4).map((r, i) => (
                  <tr key={r.id}>
                    <td className="num br">{i + 1}</td>
                    <td>
                      <Link href={`/fund/${r.id}`}>
                        <b>{r.fund.name.split(" ")[0] === "Atlas" ? r.fund.name : r.fund.name.split(" ")[0]}</b>
                      </Link>
                    </td>
                    <td className="r num">{multiple(r.tvpi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="legal" style={{ marginTop: 8 }}>
              One IPO and nine failures can still top this list. Conviction pays.
            </p>
          </section>
          <Paper as="section" style={{ padding: "20px 22px" }} aria-label="Season prizes">
            <div className="lbl">What the top three keep</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, fontSize: 14 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>Permanent title card</span>
                <span className="num">Top 3</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>Reputation carried over</span>
                <span className="num">+{cfg.demoDay.repPrizes[0]}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>Season {w.season.number + 1} entry credit</span>
                <span className="num">§{cfg.demoDay.creditPrizes[0].toLocaleString("en-US")}</span>
              </div>
            </div>
            <hr className="hair" style={{ margin: "14px 0" }} />
            <p className="mut" style={{ fontSize: 13 }}>
              Scores and balances reset at season end. Reputation and cosmetics do not.
            </p>
          </Paper>
        </aside>
      </div>
    </Page>
  );
}
