import type { SqlExec } from "./migrate";

/** Multi-row INSERT ... ON CONFLICT DO UPDATE (or DO NOTHING when `update` is empty). */
export async function bulkUpsert(
  q: SqlExec,
  table: string,
  cols: string[],
  rows: unknown[][],
  conflict: string[],
  update: string[] = cols.filter((c) => !conflict.includes(c)),
  chunk = Math.max(1, Math.floor(4000 / cols.length)),
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part
      .map((r) => {
        const ph = r.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `(${ph.join(",")})`;
      })
      .join(",");
    const colList = cols.map((c) => `"${c}"`).join(",");
    const onConflict = update.length
      ? `ON CONFLICT (${conflict.map((c) => `"${c}"`).join(",")}) DO UPDATE SET ${update.map((c) => `"${c}"=EXCLUDED."${c}"`).join(",")}`
      : `ON CONFLICT (${conflict.map((c) => `"${c}"`).join(",")}) DO NOTHING`;
    await q(`INSERT INTO "${table}" (${colList}) VALUES ${values} ${onConflict}`, params);
  }
}

export const json = (v: unknown) => JSON.stringify(v);
