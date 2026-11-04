import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bar, Card, Chip, DataTable, Delta, OutcomeLadder, StatTile, ValuationChart } from "@/components/ui";
import { Flash, Page } from "@/components/game/page";
import { DecisionView } from "@/components/game/decisions";
import { ReportButton } from "@/components/game/report";
import { companyMarks, companyStats, config, getMarkChanges, getPerspective, getWorld, sectorMedianMarks, sectorName, ticksLeft } from "@/lib/server/view";
import { prisma } from "@/lib/db/client";
import { forwardOdds } from "@/lib/rules/odds";
import { initials, pct, scripShort } from "@/lib/format";
import { companyAsk } from "@/lib/sim/pitch";
import type { Company, Pitch, Post } from "@/lib/sim/types";

export const metadata: Metadata = { title: "Company" };
export const dynamic = "force-dynamic";

const STAGE: Record<string, string> = { preseed: "Pre-seed", seed: "Seed", seriesA: "Series A" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const [w, p, changes] = await Promise.all([getWorld(), getPerspective(), getMarkChanges()]);
  const cfg = config();
  const db = await prisma();
  const c = w.companies.get(id) ?? ((await db.company.findUnique({ where: { id } }))?.state as unknown as Company | undefined);
  if (!c) notFound();
  const founder = w.founders.get(c.founderId);
  const mine = founder?.ownerId === p.userId;
  const live = c.status === "alive" || c.status === "zombie";
  const st = companyStats(w, cfg, c);
  const marks = await companyMarks(w, c.id);
  const from = Math.max(0, w.season.tick - 60);
  const series = marks.filter((m) => m.tick >= from).map((m) => ({ tick: m.tick, value: m.mark }));
  const median = await sectorMedianMarks(w, c.sector, series[0]?.tick ?? from);
  const pitches = (await db.pitch.findMany({ where: { companyId: c.id }, orderBy: { tick: "asc" } })).map((r) => r.state as unknown as Pitch);
  const deals = [...w.deals.values()].filter((d) => d.companyId === c.id && !d.followOn).sort((a, b) => a.tick - b.tick);
  const markers = [
    ...pitches.filter((x) => x.tick >= from && x.panel.length > 0 && x.offerIds.length === 0).map((x) => ({ tick: x.tick, label: `${x.panel.length} pass${x.panel.length === 1 ? "" : "es"}`, kind: "loss" as const })),
    ...deals.filter((d) => d.tick >= from).map((d) => ({ tick: d.tick, label: `Raised ${scripShort(d.check)}`, kind: "win" as const })),
  ].slice(-4);
  const posts = (await db.post.findMany({ where: { companyId: c.id, hidden: false }, orderBy: [{ tick: "desc" }, { id: "desc" }], take: 4 })).map((r) => r.state as unknown as Post);
  const offerRolls = pitches.slice(-6).flatMap((x) => x.reactions);
  const offerRate = offerRolls.length ? offerRolls.filter((r) => r.offer).length / offerRolls.length : 0.15;
  const odds = forwardOdds(
    {
      companyId: c.id,
      tick: w.season.tick,
      ticksLeft: Math.min(ticksLeft(w, cfg), cfg.outcome.oddsHorizonCap),
      status: c.status,
      cash: st.cash - c.debt,
      burnPerTick: c.lastBurn,
      revenuePerTick: st.revenuePerDay / cfg.ticks.perDay,
      growth7d: c.growth7d,
      mark: c.mark,
      percentile: c.sectorPercentile,
      ambition: founder?.ambition ?? "lifestyle",
      hype: w.season.hype,
      offerRate,
      roundSize: companyAsk(w, cfg, c),
    },
    cfg,
    w.season.commit,
  );
  const decisions = [...w.decisions.values()].filter((d) => d.status === "open" && d.userId === p.userId && (d.inputs.companyId === c.id || (d.kind === "exit" && w.exitOffers.get(d.refId)?.companyId === c.id)));
  const change = changes.get(c.id) ?? 0;
  const statusChip = c.status === "alive" ? { t: "Alive", v: "up" as const } : c.status === "zombie" ? { t: "Zombie", v: "neutral" as const } : c.status === "dead" ? { t: "Dead", v: "down" as const } : c.status === "acquired" ? { t: "Acquired", v: "brass" as const } : { t: "Public", v: "brass" as const };
  const back = `/company/${c.id}`;
  const runwayText = !live ? "—" : Number.isFinite(st.runway) ? `${Math.round(st.runway)} days` : "Ramen";
  const leadName = c.leadFundId ? w.funds.get(c.leadFundId)?.name : null;

  return (
    <Page active={mine ? "founder" : "none"}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 18 }}>
          <span className="mk" style={{ width: 64, height: 64, fontSize: 26 }} aria-hidden="true">
            {initials(c.name).slice(0, 1)}
          </span>
          <div>
            <div className="lbl">
              {sectorName(cfg, c.sector)} · {STAGE[c.stage]} · Founder {founder?.name ?? "unknown"}
            </div>
            <h1 className="h1 page-title" style={{ fontSize: 52, marginTop: 4 }}>
              {c.name}
            </h1>
          </div>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Chip variant={statusChip.v}>{statusChip.t}</Chip>
          {founder ? <Chip variant="brass">{founder.ambition.charAt(0).toUpperCase() + founder.ambition.slice(1)}</Chip> : null}
          <Chip>Season {w.season.number}</Chip>
          <ReportButton targetType="company" targetId={c.id} back={back} />
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="g5">
        <StatTile label="Valuation" value={scripShort(c.exitPrice ?? c.mark)} valueClass="br" delta={<Delta value={change} format={(x) => `${(x * 100).toFixed(1)}% this week`} />} />
        <StatTile label="Runway" value={runwayText} delta={<span className={c.debt > 0 ? "dn" : "mut"}>{c.debt > 0 ? `${scripShort(c.debt)} unpaid` : `${scripShort(st.cash)} cash`}</span>} />
        <StatTile label="Burn per day" value={scripShort(live ? st.burnPerDay : 0)} delta={<span className="mut">{c.headcount} people</span>} />
        <StatTile label="Revenue per day" value={scripShort(live ? st.revenuePerDay : 0)} delta={<Delta value={c.growth7d} format={(x) => `${Math.round(x * 100)}% week`} />} />
        <StatTile label="Sector rank" value={live ? `${c.sectorRank} / ${c.sectorSize}` : "—"} delta={<span className="mut">score {c.score.toFixed(2)}</span>} />
      </div>

      <div className="cols">
        <div style={{ flex: "1 1 700px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="card" aria-labelledby="chart">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <h2 id="chart" className="lbl">
                Valuation ticker · Season {w.season.number}, ticks {series[0]?.tick ?? from} to {series[series.length - 1]?.tick ?? w.season.tick}
              </h2>
              <div className="row" style={{ gap: 14 }}>
                <span className="legal">
                  <span className="br">━</span> {c.name}
                </span>
                <span className="legal">
                  <span className="mut">╌</span> Sector median
                </span>
              </div>
            </div>
            <ValuationChart
              series={series}
              median={median}
              markers={markers}
              summary={series.length ? `${c.name} valuation moved from ${scripShort(series[0].value)} to ${scripShort(series[series.length - 1].value)} over ticks ${series[0].tick} to ${series[series.length - 1].tick}, ${series[series.length - 1].value >= (median[median.length - 1]?.value ?? 0) ? "above" : "below"} the sector median.` : `${c.name} has no marks yet.`}
            />
            <p className="legal">Valuation = share of the {sectorName(cfg, c.sector)} pool by rank. Marks refresh every tick.</p>
          </section>

          <section className="card" aria-labelledby="score">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 id="score" className="lbl">
                Relative score · rank inside {sectorName(cfg, c.sector)}
              </h2>
              <Chip variant="brass">Composite {c.score.toFixed(2)}</Chip>
            </div>
            <DataTable
              caption="Metrics, sector percentile and weight"
              style={{ marginTop: 6 }}
              rows={[
                { k: "Revenue growth", v: `${c.growth7d >= 0 ? "+" : "−"}${Math.abs(Math.round(c.growth7d * 100))}% / week`, p: c.metricPct.growth, wt: cfg.valuation.wGrowth },
                { k: "Scale", v: `${scripShort(st.revenueAnnual)} run rate`, p: c.metricPct.scale, wt: cfg.valuation.wScale },
                { k: "Capital efficiency", v: `§${(st.burnPerDay > 0 ? st.revenuePerDay / st.burnPerDay : 0).toFixed(2)} per §1 burned`, p: c.metricPct.efficiency, wt: cfg.valuation.wEfficiency },
              ]}
              rowKey={(r) => r.k}
              columns={[
                { key: "k", header: "Metric", render: (r) => r.k },
                { key: "v", header: "Value", numeric: true, render: (r) => r.v },
                { key: "p", header: "Sector percentile", render: (r) => <Bar value={r.p} label={`${r.k} percentile ${Math.round(r.p * 100)}`} /> },
                { key: "w", header: "Weight", numeric: true, render: (r) => pct(r.wt, 0) },
              ]}
            />
          </section>
        </div>

        <aside style={{ flex: "1 1 340px", minWidth: 0, maxWidth: 420, display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="card" aria-labelledby="ladder">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 id="ladder" className="lbl">
                Outcome ladder · judged at season end
              </h2>
              <span className="legal">{ticksLeft(w, cfg)} ticks left</span>
            </div>
            <OutcomeLadder
              rows={[
                { rung: "IPO", p: odds.IPO },
                { rung: "Unicorn", p: odds.Unicorn },
                { rung: "Acquired", p: odds.Acquired },
                { rung: "Zombie", p: odds.Zombie },
                { rung: "Dead", p: odds.Dead },
              ]}
            />
            <p className="legal" style={{ marginTop: 12 }}>
              Odds come from running the sim forward {cfg.outcome.oddsRuns} times from today. They move every tick.
            </p>
          </section>

          {decisions.map((d) => (
            <DecisionView key={d.id} w={w} cfg={cfg} d={d} canAct={p.canAct} back={back} />
          ))}

          {mine && live ? (
            <Card variant={decisions.length ? "default" : "accent"}>
              <h2 className="lbl">Your call · Pitch again</h2>
              {p.canAct ? (
                <form method="post" action="/api/pitch" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                  <input type="hidden" name="back" value={back} />
                  <label className="lbl" htmlFor="note">
                    Founder note to the panel (optional, data only)
                  </label>
                  <textarea id="note" name="note" className="field" rows={2} maxLength={280} />
                  <button type="submit" className="btn">
                    Pitch the next panel
                  </button>
                  <span className="legal">{cfg.pitch.freePerDay} free pitches a day, then §{cfg.fees.extraPitch} each.</span>
                </form>
              ) : (
                <p className="mut" style={{ marginTop: 10 }}>
                  <Link className="br" style={{ textDecoration: "underline" }} href={`/signin?next=${encodeURIComponent(back)}`}>
                    Sign in
                  </Link>{" "}
                  to coach this founder.
                </p>
              )}
            </Card>
          ) : null}

          <section className="card" aria-labelledby="cliff">
            <h2 id="cliff" className="lbl">
              Cliffhangers so far
            </h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {posts.length === 0 ? <p className="mut">No news yet. Give it a tick.</p> : null}
              {posts.map((x) => (
                <div key={x.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="num br" style={{ fontSize: 12 }}>
                    T{x.tick}
                  </div>
                  <p style={{ fontSize: 14 }}>{x.text}</p>
                </div>
              ))}
            </div>
            {leadName || deals.length ? (
              <p className="legal" style={{ marginTop: 8 }}>
                Lead: {leadName ?? "nobody"} · {c.rounds} round{c.rounds === 1 ? "" : "s"}
                {c.exitPrice ? ` · exit ${scripShort(c.exitPrice)}` : ""}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </Page>
  );
}
