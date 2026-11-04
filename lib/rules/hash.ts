import { createHash } from "node:crypto";

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function sha256Words(s: string): [number, number, number, number] {
  const d = createHash("sha256").update(s, "utf8").digest();
  return [d.readUInt32BE(0), d.readUInt32BE(4), d.readUInt32BE(8), d.readUInt32BE(12)];
}

/** Stable 32-bit hash for mock providers (FNV-1a). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
