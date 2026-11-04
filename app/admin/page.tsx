import type { Metadata } from "next";
import Link from "next/link";
import { Card, Chip, DataTable, StatTile } from "@/components/ui";
import { Flash, Page } from "@/components/game/page";
import { config, getViewer, getWorld } from "@/lib/server/view";
import { prisma } from "@/lib/db/client";
import { scripShort } from "@/lib/format";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer?.isAdmin) {
    return (
      <Page active="admin">
        <h1 className="h1 page-title" style={{ fontSize: 48 }}>Admin</h1>
        <p className="mut">Admins only. <Link href="/signin?next=/admin" style={{ textDecoration: "underline" }}>Sign in</Link>.</p>
      </Page>
    );
  }
  const w = await getWorld();
  const cfg = config();
  const db = await prisma();
  const ticks = await db.tick.findMany({ where: { seasonId: w.season.id }, orderBy: { number: "desc" }, take: 8 });
  const reports = await db.report.groupBy({ by: ["targetType", "targetId"], where: { status: "open" }, _count: { _all: true } });
  const clusters = await db.user.groupBy({ by: ["ipHash"], where: { ipHash: { not: null } }, _count: { _all: true }, having: { ipHash: { _count: { gt: 1 } } } });
  const total = cfg.season.days * cfg.ticks.perDay;
  const check = w.ledger.check();
  return (
    <Page active="admin">
      <div>
        <div className="lbl">Operations · Season {w.season.number}</div>
        <h1 className="h1 page-title" style={{ fontSize: 48, marginTop: 6 }}>
          The <span className="it">Back Office</span>
        </h1>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="g5">
        <StatTile label="Tick" value={`${w.season.tick} / ${total}`} />
        <StatTile label="Supply" value={scripShort(w.ledger.supply())} delta={<span className="mut">minted − burned</span>} />
        <StatTile label="Ledger" value={check.length ? "Broken" : "Balanced"} valueClass={check.length ? "dn" : "up"} />
        <StatTile label="Hype" value={Math.round(w.season.hype)} />
        <StatTile label="Seed" value={w.season.revealed ? "Revealed" : "Sealed"} delta={<span className="mut num">commit {w.season.commit.slice(0, 10)}</span>} />
      </div>
      <div className="cols">
        <Card as="section" style={{ flex: "1 1 360px" }} aria-labelledby="tick-h">
          <h2 id="tick-h" className="lbl">Tick controls</h2>
          <p className="mut" style={{ margin: "10px 0 14px" }}>Ticks are idempotent per number. Cron calls /api/cron/tick with the cron secret.</p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <form method="post" action="/api/admin/tick">
              <input type="hidden" name="count" value="1" />
              <button className="btn" type="submit">Advance tick</button>
            </form>
            <form method="post" action="/api/admin/tick">
              <input type="hidden" name="count" value="3" />
              <button className="btn ghost" type="submit">Advance a day</button>
            </form>
          </div>
        </Card>
        <Card as="section" style={{ flex: "2 1 520px", minWidth: 0 }} aria-labelledby="log-h">
          <h2 id="log-h" className="lbl">Tick log</h2>
          <DataTable
            caption="Recent ticks with state digests"
            rows={ticks}
            rowKey={(t) => String(t.number)}
            empty={<p className="mut">No ticks yet.</p>}
            columns={[
              { key: "n", header: "Tick", render: (t) => <span className="num br">{t.number}</span> },
              { key: "d", header: "Digest", render: (t) => <span className="num">{t.digest.slice(0, 16)}</span> },
              { key: "s", header: "Supply", numeric: true, render: (t) => scripShort(Number(t.supply)) },
              { key: "st", header: "Stabilizer", numeric: true, render: (t) => t.stabilizer.toFixed(2) },
              { key: "h", header: "Hype", numeric: true, render: (t) => t.hype.toFixed(1) },
            ]}
          />
        </Card>
      </div>
      <div className="cols">
        <Card as="section" style={{ flex: "1 1 520px", minWidth: 0 }} aria-labelledby="rep-h">
          <h2 id="rep-h" className="lbl">Reports queue · {reports.length} open</h2>
          <DataTable
            caption="Reported items"
            rows={reports}
            rowKey={(r) => `${r.targetType}:${r.targetId}`}
            empty={<p className="mut" style={{ marginTop: 10 }}>No open reports. Quiet floor.</p>}
            columns={[
              { key: "t", header: "Type", render: (r) => <Chip>{r.targetType}</Chip> },
              { key: "i", header: "Item", render: (r) => <span className="num">{r.targetId}</span> },
              { key: "c", header: "Reports", numeric: true, render: (r) => <span className={r._count._all >= cfg.moderation.autoHideAt ? "dn" : undefined}>{r._count._all}</span> },
              {
                key: "a",
                header: "Review",
                render: (r) => (
                  <div className="row" style={{ gap: 8 }}>
                    <form method="post" action={`/api/admin/reports/${r.targetId}`}>
                      <input type="hidden" name="targetType" value={r.targetType} />
                      <input type="hidden" name="decision" value="keep" />
                      <button className="btn ghost sm" type="submit">Keep</button>
                    </form>
                    <form method="post" action={`/api/admin/reports/${r.targetId}`}>
                      <input type="hidden" name="targetType" value={r.targetType} />
                      <input type="hidden" name="decision" value="remove" />
                      <button className="btn red sm" type="submit">Remove</button>
                    </form>
                  </div>
                ),
              },
            ]}
          />
        </Card>
        <Card as="section" style={{ flex: "1 1 320px" }} aria-labelledby="syb-h">
          <h2 id="syb-h" className="lbl">Same-IP clusters</h2>
          {clusters.length === 0 ? <p className="mut" style={{ marginTop: 10 }}>No clusters flagged.</p> : null}
          {clusters.map((c) => (
            <p key={c.ipHash} className="num" style={{ marginTop: 8 }}>
              {c.ipHash?.slice(0, 12)} · {c._count._all} accounts
            </p>
          ))}
        </Card>
      </div>
    </Page>
  );
}
