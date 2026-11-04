import type { ReactNode } from "react";
import { cx, Bar, Chip } from "./primitives";
import { deltaPct, direction, scripShort } from "@/lib/format";

export interface Column<T> {
  key: string;
  header: ReactNode;
  numeric?: boolean;
  render: (row: T) => ReactNode;
  className?: (row: T) => string | undefined;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selected,
  caption,
  empty,
  className,
  style,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selected?: (row: T) => boolean;
  caption?: string;
  empty?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="tbl-box">
      <table className={cx("tbl", className)} style={style}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? "r" : undefined} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={selected?.(r) ? "sel" : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={cx(c.numeric && "r num", c.className?.(r))}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type HypeBand = "Frozen" | "Cool" | "Warm" | "Hot" | "Bubble";
export function hypeBand(h: number): HypeBand {
  if (h < 20) return "Frozen";
  if (h < 40) return "Cool";
  if (h < 60) return "Warm";
  if (h < 80) return "Hot";
  return "Bubble";
}

export function HypeMeter({
  value,
  delta,
  overheatedAt = 70,
  crashRisk,
  note,
  compact,
}: {
  value: number;
  delta?: number;
  overheatedAt?: number;
  crashRisk?: number;
  note?: ReactNode;
  compact?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  const band = hypeBand(v);
  const overheated = v >= overheatedAt;
  const segs = ["var(--hype-1)", "var(--hype-2)", "var(--hype-3)", "var(--hype-4)", "var(--hype-5)"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div className="num br" style={{ fontSize: compact ? 56 : 72, fontWeight: 600, lineHeight: 1 }}>
          {Math.round(v)}
        </div>
        {overheated ? <Chip variant="down">Overheated</Chip> : <Chip>{band}</Chip>}
        {delta != null ? (
          <span className={cx("num", direction(delta, 0.5) === "up" ? "up" : direction(delta, 0.5) === "dn" ? "dn" : "mut")} style={{ fontSize: 13 }}>
            {direction(delta, 0.5) === "up" ? "▲" : direction(delta, 0.5) === "dn" ? "▼" : "►"} {Math.abs(Math.round(delta))}
          </span>
        ) : null}
      </div>
      <div
        style={{ position: "relative", paddingTop: 14 }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
        aria-label={`Hype index ${Math.round(v)} of 100, ${band}${overheated ? ", overheated" : ""}`}
      >
        <div style={{ display: "flex", height: 12, gap: 3 }}>
          {segs.map((c) => (
            <i key={c} style={{ flex: 1, background: c }} />
          ))}
        </div>
        <div style={{ position: "absolute", left: `${v}%`, top: 0, width: 2, height: 28, background: "var(--tx)" }} />
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="legal">Frozen</span>
        <span className="legal">Bubble</span>
      </div>
      {note ? (
        <>
          <hr className="hair" />
          <div className="mut" style={{ fontSize: 14 }}>
            {note}
          </div>
        </>
      ) : null}
      {crashRisk != null ? (
        <div className="legal">
          Crash risk this season · <span className="dn">{Math.round(crashRisk * 100)}%</span>
        </div>
      ) : null}
    </div>
  );
}

export interface HeatTile {
  id: string;
  name: string;
  pool: number;
  growth: number;
  companies?: number;
  pulse?: boolean;
}

/** Spans by pool rank (mirrors the World mockup): largest 2x2, 2nd and 4th 2x1, the rest 1x1; dense flow packs them. */
export function heatSpans(tiles: HeatTile[], cols = 4): Array<{ col: number; row: number }> {
  const order = tiles.map((t, i) => ({ i, pool: t.pool })).sort((a, b) => b.pool - a.pool);
  const spans = tiles.map(() => ({ col: 1, row: 1 }));
  order.forEach((o, rank) => {
    if (cols >= 4) {
      if (rank === 0) spans[o.i] = { col: 2, row: 2 };
      else if (rank === 1 || rank === 3) spans[o.i] = { col: 2, row: 1 };
    } else if (rank === 0) spans[o.i] = { col: 1, row: 2 };
  });
  return spans;
}

export function SectorHeatmap({ tiles, flatBand = 0.005 }: { tiles: HeatTile[]; flatBand?: number }) {
  const sorted = [...tiles].sort((a, b) => b.pool - a.pool);
  const spans = heatSpans(sorted);
  return (
    <div className="heatmap" role="list" aria-label="Sector demand pools">
      {sorted.map((t, i) => {
        const d = direction(t.growth, flatBand);
        const bg = d === "up" ? "var(--heat-up)" : d === "dn" ? "var(--heat-dn)" : "var(--heat-flat)";
        const big = spans[i].row === 2;
        const wide = spans[i].col === 2 && !big;
        return (
          <div
            role="listitem"
            key={t.id}
            className={cx("heat-tile", t.pulse && "pulse")}
            style={{ gridColumn: `span ${spans[i].col}`, gridRow: `span ${spans[i].row}`, background: bg, padding: big ? 14 : 12 }}
            aria-label={`${t.name}: pool ${scripShort(t.pool)}, 7-day change ${deltaPct(t.growth, 1, flatBand)}`}
          >
            {big ? (
              <>
                <div>
                  <div className="h3">{t.name}</div>
                  {t.companies != null ? (
                    <div className="legal" style={{ color: "#CFE3D8" }}>
                      {t.companies} companies
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="num" style={{ fontSize: 30, fontWeight: 600 }}>
                    {scripShort(t.pool)}
                  </div>
                  <div className={cx("num", d === "up" ? "up" : d === "dn" ? "dn" : "mut")}>{deltaPct(t.growth, 1, flatBand)}</div>
                </div>
              </>
            ) : wide ? (
              <>
                <div className="h3">{t.name}</div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                    {scripShort(t.pool)}
                  </span>
                  <span className={cx("num", d === "up" ? "up" : d === "dn" ? "dn" : "mut")}>{deltaPct(t.growth, 1, flatBand)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="h3" style={{ fontSize: 17 }}>
                  {t.name}
                </div>
                <div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>
                    {scripShort(t.pool)}
                  </div>
                  <div className={cx("num", d === "up" ? "up" : d === "dn" ? "dn" : "mut")} style={{ fontSize: 12 }}>
                    {deltaPct(t.growth, 1, flatBand)}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RubricBars({ rubric }: { rubric: Array<{ label: string; value: number }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
      {rubric.map((r) => (
        <div key={r.label}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>{r.label}</span>
            <span className="num">{r.value.toFixed(1)}</span>
          </div>
          <Bar value={r.value / 10} label={`${r.label} ${r.value.toFixed(1)} of 10`} style={{ marginTop: 5 }} />
        </div>
      ))}
    </div>
  );
}

export interface RollRow {
  fund: string;
  p: number;
  roll: number | null;
  offer: boolean;
}

export function RollTable({ rows, commitment }: { rows: RollRow[]; commitment: string }) {
  return (
    <>
      <div className="lbl">Seeded roll · seed {commitment} · the model never decides</div>
      <table className="tbl" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th scope="col">Fund</th>
            <th className="r" scope="col">P(offer)</th>
            <th className="r" scope="col">Roll</th>
            <th className="r" scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fund}>
              <td>{r.fund}</td>
              <td className="r num">{r.p.toFixed(2)}</td>
              <td className="r num">{r.roll == null ? "—" : r.roll.toFixed(2)}</td>
              <td className={cx("r num", r.offer ? "up" : "dn")}>{r.offer ? "OFFER" : "PASS"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legal" style={{ marginTop: 10 }}>
        P(offer) = interest × thesis fit. A roll at or under it means a term sheet.
      </p>
    </>
  );
}

export interface LadderRow {
  rung: "IPO" | "Unicorn" | "Acquired" | "Zombie" | "Dead";
  p: number;
}

export function OutcomeLadder({ rows }: { rows: LadderRow[] }) {
  const best = rows.reduce((a, b) => (b.p > a.p ? b : a), rows[0]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }} role="list" aria-label="Outcome odds">
      {rows.map((r) => {
        const top = r === best && r.p > 0;
        const dead = r.rung === "Dead";
        return (
          <div
            key={r.rung}
            role="listitem"
            className="row"
            style={{ gap: 10, ...(top ? { background: "var(--s2)", padding: 6, margin: "0 -6px", borderRadius: 3 } : {}) }}
            aria-label={`${r.rung} ${Math.round(r.p * 100)} percent${top ? ", most likely" : ""}`}
          >
            <span className={top ? "br" : undefined} style={{ width: 84, fontFamily: "var(--disp)", fontWeight: 700 }}>
              {r.rung}
            </span>
            <div className={cx("bar", dead && "dead")} style={{ flex: 1 }} aria-hidden="true">
              <i style={{ width: `${Math.max(r.p > 0 ? 1 : 0, Math.round(r.p * 100))}%` }} />
            </div>
            <span className={cx("num", top && "br", dead && !top && "dn")} style={{ width: 40, textAlign: "right" }}>
              {Math.round(r.p * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
