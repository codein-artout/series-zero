/** Display formatting for scrip, percentages, multiples. Pure, no I/O. */

export const SCRIP = "§";

function trimZero(s: string): string {
  return s.replace(/\.0$/, "");
}

/** §9.2M, §26K, §840. `decimals` applies to M/K. */
export function scripShort(n: number, decimals = 1): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${sign}${SCRIP}${trimZero((a / 1_000_000_000).toFixed(decimals))}B`;
  if (a >= 1_000_000) return `${sign}${SCRIP}${(a / 1_000_000).toFixed(decimals)}M`;
  if (a >= 10_000) return `${sign}${SCRIP}${Math.round(a / 1000)}K`;
  if (a >= 1_000) return `${sign}${SCRIP}${trimZero((a / 1000).toFixed(1))}K`;
  return `${sign}${SCRIP}${Math.round(a)}`;
}

/** §1,200,000 */
export function scripFull(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}${SCRIP}${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

export function int(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 13.0% (no sign) */
export function pct(x: number, decimals = 1): string {
  return `${(x * 100).toFixed(decimals)}%`;
}

/** +11.0% / −2.2% with sign (for changes) */
export function pctSigned(x: number, decimals = 1): string {
  const v = x * 100;
  const s = Math.abs(v).toFixed(decimals);
  if (Number(s) === 0) return `${s}%`;
  return `${v > 0 ? "+" : "−"}${s}%`;
}

export function multiple(x: number, decimals = 1): string {
  return `${x.toFixed(decimals)}x`;
}

export type Direction = "up" | "dn" | "flat";

export function direction(x: number, flatBand = 0.005): Direction {
  if (x > flatBand) return "up";
  if (x < -flatBand) return "dn";
  return "flat";
}

export function glyph(d: Direction): string {
  return d === "up" ? "▲" : d === "dn" ? "▼" : "►";
}

/** "▲ 18.4%" — glyph plus magnitude, used in tape and tables. */
export function deltaPct(x: number, decimals = 1, flatBand = 0.005): string {
  const d = direction(x, flatBand);
  const mag = Math.abs(x * 100).toFixed(decimals);
  if (d === "flat") return `► ${x < 0 && Number(mag) > 0 ? "−" : ""}${mag}%`;
  return `${glyph(d)} ${mag}%`;
}

export function fixed(x: number, d = 2): string {
  return x.toFixed(d);
}

export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z&\s]/g, " ").split(/\s+/).filter((p) => p && p !== "&");
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function handle(name: string): string {
  return "@" + name.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
}

export function ticksLabel(n: number): string {
  return `${n} tick${n === 1 ? "" : "s"}`;
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((x) => String(x).padStart(2, "0")).join(":");
}
