import { scripShort } from "@/lib/format";

export interface ChartPoint {
  tick: number;
  value: number;
}
export interface ChartMarker {
  tick: number;
  label: string;
  kind: "loss" | "win";
}

function niceStep(max: number, lines: number): number {
  const raw = max / lines;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
}

/**
 * Valuation ticker. SVG area plus brass line, dashed median, event markers.
 * `compact` = phone version: thicker strokes, fewer gridlines.
 */
export function ValuationChart({
  series,
  median,
  markers = [],
  summary,
  compact,
  width = 760,
  height = 270,
}: {
  series: ChartPoint[];
  median?: ChartPoint[];
  markers?: ChartMarker[];
  summary: string;
  compact?: boolean;
  width?: number;
  height?: number;
}) {
  const left = 34;
  const right = width - 20;
  const top = 30;
  const bottom = height - 30;
  if (series.length === 0) {
    return (
      <p className="mut" role="img" aria-label={summary} style={{ padding: "24px 0" }}>
        No marks yet. Give it a tick.
      </p>
    );
  }
  const t0 = series[0].tick;
  const t1 = Math.max(series[series.length - 1].tick, t0 + 1);
  const maxV = Math.max(...series.map((p) => p.value), ...(median ?? []).map((p) => p.value), 1) * 1.1;
  const lines = compact ? 3 : 5;
  const step = niceStep(maxV, lines);
  const yMax = step * Math.ceil(maxV / step);
  const x = (t: number) => left + ((t - t0) / (t1 - t0)) * (right - left);
  const y = (v: number) => bottom - (v / yMax) * (bottom - top);
  const pts = series.map((p) => `${x(p.tick).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${pts} ${x(series[series.length - 1].tick).toFixed(1)},${bottom} ${x(t0).toFixed(1)},${bottom}`;
  const grid: number[] = [];
  for (let v = 0; v <= yMax + 1e-6; v += step) grid.push(v);
  const last = series[series.length - 1];
  const mid = Math.round((t0 + t1) / 2);
  const sw = compact ? 3.5 : 2.5;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={summary} style={{ display: "block", marginTop: 10 }}>
      <g stroke="#2C4A3F" strokeWidth="1">
        {grid.map((v) => (
          <line key={v} x1={left} y1={y(v)} x2={right} y2={y(v)} />
        ))}
      </g>
      <g fill="#9DB2A7" fontFamily="IBM Plex Mono, monospace" fontSize={compact ? 12 : 10}>
        {grid.map((v) => (
          <text key={v} x="0" y={y(v) + 4}>
            {v === 0 ? "0" : scripShort(v, 0).replace("§", "")}
          </text>
        ))}
      </g>
      <polygon points={area} fill="#C8A24A" fillOpacity="0.12" />
      {median && median.length > 1 ? (
        <polyline
          points={median.map((p) => `${x(p.tick).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="#9DB2A7"
          strokeWidth={compact ? 2 : 1.5}
          strokeDasharray="5 5"
        />
      ) : null}
      <polyline className="chart-line" points={pts} fill="none" stroke="#E4C677" strokeWidth={sw} strokeLinejoin="round" />
      {markers.map((m, i) => {
        const mx = x(Math.min(Math.max(m.tick, t0), t1));
        const c = m.kind === "loss" ? "#FF8A78" : "#6FE0A0";
        return (
          <g key={`${m.tick}-${i}`}>
            <line x1={mx} y1={top} x2={mx} y2={bottom} stroke={c} strokeDasharray="3 4" />
            {!compact ? (
              <text x={mx + 6} y={top + 10 + (i % 2) * 14} fill={c} fontFamily="IBM Plex Mono, monospace" fontSize="10">
                {m.label}
              </text>
            ) : null}
          </g>
        );
      })}
      <circle cx={x(last.tick)} cy={y(last.value)} r={compact ? 6 : 5} fill="#E4C677" />
      <g fontFamily="IBM Plex Mono, monospace" fontSize={compact ? 12 : 11} fill="#9DB2A7">
        <text x={left} y={height - 8}>
          T{t0}
        </text>
        {!compact ? (
          <text x={x(mid) - 12} y={height - 8}>
            T{mid}
          </text>
        ) : null}
        <text x={right - 28} y={height - 8}>
          T{t1}
        </text>
      </g>
    </svg>
  );
}
