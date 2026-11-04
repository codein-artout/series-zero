import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, DataTable, Delta, Paper, StatTile } from "@/components/ui";
import { Flash, Page } from "@/components/game/page";
import { ActionButton } from "@/components/game/action-button";
import { ReportButton } from "@/components/game/report";
import { config, getPerspective, getWorld, sectorName } from "@/lib/server/view";
import { fundMetrics } from "@/lib/sim/funds";
import { initials, multiple, pct, scripShort } from "@/lib/format";
import { SECTOR_IDS, type SectorId } from "@/config/game";
import { prisma } from "@/lib/db/client";
import type { Company } from "@/lib/sim/types";

export const metadata: Metadata = { title: "Fund" };
export const dynamic = "force-dynamic";

const SHADES = ["#E4C677", "#C8A24A", "#9C7E36", "#6E5826", "#43371A"];

function DriftBar({ weights, label, cfg }: { weights: Record<SectorId, number>; label: string; cfg: ReturnType<typeof config> }) {
  const top = [...SECTOR_IDS].sort((a, b) => weights[b] - weights[a]);
  const shown = top.slice(0, 4);
  const rest = top.slice(4).reduce((a, s) => a + weights[s], 0);
  const parts = [...shown.map((s) => ({ k: cfg.sectors.find((x) => x.id === s)!.short, v: weights[s] })), { k: "", v: rest }];
  return (
    <div style={{ marginTop: 12 }}>
      <div className="legal" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", height: 34, fontFamily: "var(--mono)", fontSize: 11 }} role="img" aria-label={`${label}: ${parts.map((x) => `${x.k || "rest"} ${Math.round(x.v * 100)} percent`).join(", ")}`}>
        {parts.map((x, i) => (
          <div key={i} style={{ width: `${x.v * 100}%`, background: SHADES[i], color: i < 3 ? "#16130A" : "var(--tx)", padding: "8px 4px", overflow: "hidden", whiteSpace: "nowrap" }}>
            {x.v >= 0.12 && x.k ? `${x.k} ${Math.round(x.v * 100)}` : Math.round(x.v * 100)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function FundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const [w, p] = await Promise.all([getWorld(), getPerspective()]);
  const cfg = config();
  const f = w.funds.get(id);
  if (!f) notFound();
  const m = fundMetrics(w, cfg, f);
  const mine = f.ownerId === p.userId;
  const db = await prisma();
  const missing = m.positions.filter((x) => !w.companies.has(x.companyId)).map((x) => x.companyId);
  const extra = new Map((await db.company.findMany({ where: { id: { in: missing } } })).map((r) => [r.id, r.state as unknown as Company]));
  const co = (cid: string) => w.companies.get(cid) ?? extra.get(cid);
  const positions = [...m.positions].sort((a, b) => (b.proceeds + b.share * b.mark) / Math.max(1, b.cost) - (a.proceeds + a.share * a.mark) / Math.max(1, a.cost));
  const weekAgo = [...f.moicHistory].reverse().find((h) => h.tick <= w.season.tick - cfg.ticks.perWeek * 3) ?? f.moicHistory[0];
  const bestCo = m.best.companyId ? co(m.best.companyId) : undefined;
  const pending = [...w.offers.values()].filter((o) => o.fundId === f.id && o.status === "open").length;
  const meeting = mine ? [...w.decisions.values()].find((d) => d.kind === "meeting" && d.agentId === f.id && d.status === "open") : undefined;
  const flow = (meeting?.inputs.companies as Array<{ id: string; name: string; sector: SectorId; ask: number }> | undefined) ?? [];
  const recent = await db.pitch.findMany({ where: { seasonId: w.season.id }, orderBy: { tick: "desc" }, take: 200 });
  const sat = recent.map((r) => r.state as unknown as { id: string; tick: number; companyId: string; panel: string[]; reactions: Array<{ fundId: string; offer: boolean }> }).filter((x) => x.panel.includes(f.id)).slice(0, 3);
  const stageText = f.stages.map((s) => (s === "seriesA" ? "A" : s === "preseed" ? "Pre-seed" : "Seed")).join(" to ");
  const [first, ...rest] = f.name.split(" ");
  const biggest = [...SECTOR_IDS].map((s) => ({ s, d: f.sectorWeights[s] - f.startWeights[s] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const back = `/fund/${f.id}`;

  return (
    <Page active={mine ? "fund" : "none"}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="row" style={{ gap: 18 }}>
          <span className="mk" style={{ width: 64, height: 64, fontSize: 26 }} aria-hidden="true">
            {initials(f.name).slice(0, 1)}
          </span>
          <div>
            <div className="lbl">
              {stageText} · {cfg.vc.archetypes[f.archetype].label} · Season {w.season.number}
            </div>
            <h1 className="h1 page-title" style={{ fontSize: 52, marginTop: 4 }}>
              {first} {rest.length ? <span className="it">{rest.join(" ")}</span> : null}
            </h1>
          </div>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Chip variant="brass">Reputation {Math.round(f.reputation)}</Chip>
          <Chip>
            Thesis edits {Math.max(0, cfg.thesis.editsPerSeason - f.thesisEdits)} of {cfg.thesis.editsPerSeason}
          </Chip>
          <ReportButton targetType="fund" targetId={f.id} back={back} />
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="g5">
        <StatTile label="Fund size" value={scripShort(f.size, 0)} delta={<span className="mut">{scripShort(m.deployed)} deployed</span>} />
        <StatTile label="Fund MOIC" value={multiple(m.tvpi)} valueClass="br" delta={<Delta value={weekAgo ? m.tvpi - weekAgo.moic : 0} flatBand={0.05} format={(x) => `${x.toFixed(1)}x lately`} />} />
        <StatTile label="Hit rate" value={`${m.hits} / ${m.total}`} delta={<span className="mut">returned above 1x</span>} />
        <StatTile label="Best exit" value={m.best.multiple ? multiple(m.best.multiple) : "—"} delta={<span className="mut">{bestCo?.name ?? "No exits yet"}</span>} />
        <StatTile label="Dry powder" value={scripShort(m.dryPowder)} delta={<span className="mut">{pending} check{pending === 1 ? "" : "s"} pending</span>} />
      </div>

      <div className="cols">
        <section className="card" style={{ flex: "1.5 1 640px", minWidth: 0 }} aria-labelledby="portfolio">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="portfolio" className="lbl">
              Portfolio · marked to the sector pool
            </h2>
            <span className="legal">
              {Math.min(8, positions.length)} of {positions.length} shown
            </span>
          </div>
          <DataTable
            caption="Portfolio positions"
            style={{ marginTop: 6 }}
            rows={positions.slice(0, 8)}
            rowKey={(x) => x.companyId}
            empty={<p className="mut" style={{ marginTop: 10 }}>No checks written yet. Take a meeting.</p>}
            columns={[
              { key: "c", header: "Company", render: (x) => <Link href={`/company/${x.companyId}`}><b>{co(x.companyId)?.name ?? x.companyId}</b></Link> },
              { key: "s", header: "Sector", render: (x) => <span className="mut">{co(x.companyId) ? sectorName(cfg, co(x.companyId)!.sector) : ""}</span> },
              { key: "k", header: "Check", numeric: true, render: (x) => scripShort(x.cost) },
              { key: "o", header: "Own", numeric: true, render: (x) => pct(x.share) },
              { key: "m", header: "Mark", numeric: true, render: (x) => scripShort(x.status === "live" ? x.share * x.mark : x.proceeds) },
              { key: "x", header: "MOIC", numeric: true, render: (x) => multiple(x.cost ? (x.proceeds + (x.status === "live" ? x.share * x.mark : 0)) / x.cost : 0), className: (x) => ((x.proceeds + (x.status === "live" ? x.share * x.mark : 0)) / Math.max(1, x.cost) >= 1 ? "up" : "dn") },
              {
                key: "st",
                header: "Status",
                render: (x) => {
                  const c = co(x.companyId);
                  if (x.status === "exited") return <Chip variant="brass">Exit</Chip>;
                  if (x.status === "written_off") return <Chip variant="down">Dead</Chip>;
                  if (c?.status === "zombie") return <Chip>Zombie</Chip>;
                  if (c?.status === "public") return <Chip variant="brass">Public</Chip>;
                  return x.share * x.mark < x.cost * 0.6 ? <Chip variant="down">Falling</Chip> : <Chip variant="up">Alive</Chip>;
                },
              },
            ]}
          />
        </section>

        <aside style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="card" aria-labelledby="drift">
            <h2 id="drift" className="lbl">
              Thesis drift · sector weight, percent
            </h2>
            <DriftBar weights={f.startWeights} label="Season start" cfg={cfg} />
            <DriftBar weights={f.sectorWeights} label={`Now · tick ${w.season.tick}`} cfg={cfg} />
            <p className="mut" style={{ fontSize: 14, marginTop: 12 }}>
              {biggest
                .slice(0, 2)
                .map((b) => `${sectorName(cfg, b.s)} ${b.d >= 0 ? "+" : "−"}${Math.abs(Math.round(b.d * 100))} points`)
                .join(". ")}
              . {cfg.sectors.map((s) => `${s.short} ${s.name.replace(/^AI /, "").toLowerCase()}`).slice(0, 4).join(" · ")}.
            </p>
          </section>
          <Paper style={{ padding: "22px 24px", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.7 }} aria-label="Thesis document diff">
            <div className="lbl" style={{ marginBottom: 8 }}>
              vc_thesis.md · changes since season start
            </div>
            {f.thesisText.split("\n").map((l, i) => (
              <div key={i}>{l}</div>
            ))}
            {f.driftNotes.slice(-3).map((n, i) => (
              <div key={`d${i}`} style={{ background: "#1B6B4326" }}>
                + {n.text}
              </div>
            ))}
            {f.redFlagLines.map((l, i) => (
              <div key={`r${i}`}>Red flag: {l}</div>
            ))}
          </Paper>
        </aside>
      </div>

      <section className="card" aria-labelledby="deal-flow" id="deal-flow">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="deal-flow-h" className="lbl">
            {mine ? "Deal flow · meetings you can take this tick" : `Recent meetings · ${f.name}`}
          </h2>
          <span className="legal">{mine ? `Pick 1 of ${flow.length || cfg.vc.dealFlowPerTick}` : "Read only"}</span>
        </div>
        <div className="g3 stack" style={{ marginTop: 12 }}>
          {mine && meeting
            ? flow.map((x) => {
                const c = w.companies.get(x.id);
                return (
                  <div key={x.id} style={{ border: "1px solid var(--line2)", padding: 14, borderRadius: 4 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>{x.name}</b>
                      <Chip>{sectorName(cfg, x.sector)}</Chip>
                    </div>
                    <p className="mut" style={{ fontSize: 14, margin: "6px 0 10px" }}>
                      {w.ideas.get(c?.ideaId ?? "")?.oneLiner ?? ""} Asking {scripShort(x.ask)}.
                    </p>
                    <ActionButton action="/api/decisions/meeting" fields={{ ref: meeting.refId, companyId: x.id }} label="Take meeting" variant="ghost" canAct={p.canAct} back={back} />
                  </div>
                );
              })
            : sat.map((x) => {
                const c = w.companies.get(x.companyId);
                const r = x.reactions.find((y) => y.fundId === f.id);
                return (
                  <div key={x.id} style={{ border: "1px solid var(--line2)", padding: 14, borderRadius: 4 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>{c?.name ?? "A company"}</b>
                      <Chip variant={r?.offer ? "up" : "down"}>{r?.offer ? "Offer" : "Pass"}</Chip>
                    </div>
                    <p className="mut" style={{ fontSize: 14, margin: "6px 0 10px" }}>Tick {x.tick}.</p>
                    <Link className="btn ghost" href={`/pitch/${x.id}`}>
                      Replay pitch
                    </Link>
                  </div>
                );
              })}
          {(mine && meeting ? flow.length : sat.length) === 0 ? <p className="mut">No meetings this tick. Founders are busy building.</p> : null}
        </div>
      </section>
    </Page>
  );
}
