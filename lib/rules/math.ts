export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
export function mean(xs: readonly number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}
export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** Rank-based percentiles in [0,1], ties averaged. Single element gets 0.5. */
export function percentileRanks(xs: readonly number[]): number[] {
  const n = xs.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(n);
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && idx[j + 1].v === idx[k].v) j++;
    const avgRank = (k + j) / 2;
    for (let m = k; m <= j; m++) out[idx[m].i] = avgRank / (n - 1);
    k = j + 1;
  }
  return out;
}
export function round(x: number, step: number): number {
  return Math.round(x / step) * step;
}
export function roundInt(x: number): number {
  return Math.round(x);
}
