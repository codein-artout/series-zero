import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, Chip, DataTable, DecisionCard, HypeMeter, SectorHeatmap } from "@/components/ui";
import { Page } from "@/components/game/page";
import { DecisionView } from "@/components/game/decisions";
import { Countdown } from "@/components/game/countdown";
import { config, decisionsFor, getMarkChanges, getPerspective, getWorld, nextTickAt, sectorName, ticksLeft } from "@/lib/server/view";
import { prisma } from "@/lib/db/client";
import { crashRiskSeason } from "@/lib/rules/world";
import { deltaPct, direction, fmtCountdown, scripShort } from "@/lib/format";
import { liveCompanies, sectorGrowth7d } from "@/lib/sim/world";
import type { WorldEvent } from "@/lib/sim/types";

export const metadata: Metadata = { title: "The Floor" };
export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const [w, p, changes] = await Promise.all([getWorld(), getPerspective(), getMarkChanges()]);
  const cfg = config();
  const total = cfg.season.days * cfg.ticks.perDay;
  const decisions = decisionsFor(w, p.userId).slice(0, 3);
  const myFund = [...w.funds.values()].find((f) => f.ownerId === p.userId);
  const db = await prisma();
  const events = (await db.worldEvent.findMany({ where: { seasonId: w.season.id }, orderBy: [{ tick: "desc" }, { id: "desc" }], take: 4 })).map((e) => e.state as unknown as WorldEvent);
  const live = liveCompanies(w);
  const movers = [...live].sort((a, b) => Math.abs(changes.get(b.id) ?? 0) - Math.abs(changes.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1)).slice(0, 5);
  const counts = new Map<string, number>();
  for (const c of live) counts.set(c.sector, (counts.get(c.sector) ?? 0) + 1);
  const tiles = w.sectors.map((s) => ({ id: s.id, name: sectorName(cfg, s.id), pool: s.pool, growth: sectorGrowth7d(s, cfg), companies: counts.get(s.id) ?? 0, pulse: s.history.length > 1 && Math.abs(s.pool / s.history[s.history.length - 2] - 1) > 0.05 }));
  const hot = Object.entries(w.season.checksBySector).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? [...w.sectors].sort((a, b) => sectorGrowth7d(b, cfg) - sectorGrowth7d(a, cfg))[0].id;
  const risk = crashRiskSeason(w.season.hype, ticksLeft(w, cfg), cfg);
  const target = nextTickAt(cfg).getTime();
  const back = "/floor";
  const lastDrift = myFund?.driftNotes[myFund.driftNotes.length - 1];

  return (
    <Page active="floor">
      <div className="row floor-head" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="lbl">
            Season {w.season.number} · Tick {w.season.tick} of {total}
          </div>
          <h1 className="h1 page-title" style={{ fontSize: 52, marginTop: 6 }}>
            The Floor
          </h1>
        </div>
        <div className="card next-tick" style={{ padding: "12px 18px", display: "flex", gap: 18, alignItems: "center" }}>
          <div>
            <div className="lbl">Next tick in</div>
            <Countdown className="num br" style={{ fontSize: 24, fontWeight: 600 }} target={target} initial={fmtCountdown(target - Date.now())} />
          </div>
          <ButtonLink variant="ghost" href="/wire" className="hide-phone">
            Catch up
          </ButtonLink>
        </div>
      </div>

      <section aria-labelledby="waiting">
        <h2 id="waiting" className="lbl" style={{ marginBottom: 10 }}>
          Waiting on you · {decisions.length} call{decisions.length === 1 ? "" : "s"}
          {p.spectating ? " · demo coach" : ""}
        </h2>
        <div className="g3 stack">
          {decisions.map((d) => (
            <DecisionView key={d.id} w={w} cfg={cfg} d={d} canAct={p.canAct} back={back} />
          ))}
          {decisions.length < 3 && myFund && lastDrift ? (
            <DecisionCard type="Thesis" meta={`${Math.max(0, cfg.thesis.editsPerSeason - myFund.thesisEdits)} of ${cfg.thesis.editsPerSeason} edits left`} secondary={{ label: "Edit thesis", href: "/create?tab=vc" }}>
              <p>
                {myFund.name} drifted: {lastDrift.text.replace(/\.$/, "")}. Keep it?
              </p>
            </DecisionCard>
          ) : null}
          {decisions.length === 0 && !lastDrift ? (
            <Card>
              <p className="mut">No calls waiting. Pitch someone.</p>
              <div style={{ marginTop: 14 }}>
                <ButtonLink href="/">Pitch your startup</ButtonLink>
              </div>
            </Card>
          ) : null}
        </div>
      </section>

      <div className="cols stretch">
        <section className="card" style={{ flex: "0 0 300px", display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="hype">
          <h2 id="hype" className="lbl">
            Hype index
          </h2>
          <HypeMeter
            value={w.season.hype}
            overheatedAt={cfg.hype.overheatedAt}
            crashRisk={risk}
            note={`Above 80 the next tick can crash a sector. Herding VCs are already paying up in ${sectorName(cfg, hot as never)}.`}
          />
        </section>
        <section className="card" style={{ flex: "1 1 600px", minWidth: 0 }} aria-labelledby="pools">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 id="pools" className="lbl">
              Sector demand pools · tile size = pool
            </h2>
            <span className="legal">7-day change</span>
          </div>
          <SectorHeatmap tiles={tiles} flatBand={cfg.events.flatBand} />
          <p className="legal" style={{ marginTop: 10 }}>
            Green = pool growing. Red = shrinking. Grey = flat. Every figure is simulated.
          </p>
        </section>
      </div>

      <div className="cols stretch">
        <section className="card" style={{ flex: "1 1 480px", minWidth: 0 }} aria-labelledby="news">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h2 id="news" className="lbl">
              Wire · world events
            </h2>
            <Chip>Fixture feed</Chip>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {events.length === 0 ? <p className="mut">Quiet tick. No news is still news.</p> : null}
            {events.map((e) => {
              const pctShock = Math.round(e.shock * 100);
              const variant = e.kind === "crash" ? "down" : e.kind === "regulation" && e.shock > 0 ? "brass" : e.shock > 0 ? "up" : e.shock < 0 ? "down" : "neutral";
              return (
                <div key={e.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <p style={{ fontWeight: 500 }}>{e.headline}</p>
                    <Chip variant={variant}>
                      {sectorName(cfg, e.sector)} {pctShock >= 0 ? "+" : "−"}
                      {Math.abs(pctShock)}%
                    </Chip>
                  </div>
                  <div className="legal" style={{ marginTop: 4 }}>
                    {e.kind.charAt(0).toUpperCase() + e.kind.slice(1)} · Tick {e.tick}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="card" style={{ flex: "1 1 520px", minWidth: 0 }} aria-labelledby="movers">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <h2 id="movers" className="lbl">
              Movers · 7 days
            </h2>
            <Link className="lbl br" href="/demo-day">
              Full board →
            </Link>
          </div>
          <DataTable
            caption="Biggest valuation moves over 7 days"
            rows={movers}
            rowKey={(c) => c.id}
            columns={[
              { key: "n", header: "Company", render: (c) => <Link href={`/company/${c.id}`}><b>{c.name}</b></Link> },
              { key: "s", header: "Sector", render: (c) => <span className="mut">{sectorName(cfg, c.sector)}</span> },
              { key: "v", header: "Valuation", numeric: true, render: (c) => scripShort(c.mark) },
              { key: "d", header: "Δ", numeric: true, render: (c) => deltaPct(changes.get(c.id) ?? 0), className: (c) => { const d = direction(changes.get(c.id) ?? 0); return d === "up" ? "up" : d === "dn" ? "dn" : "mut"; } },
            ]}
          />
        </section>
      </div>
    </Page>
  );
}
