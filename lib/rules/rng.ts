/**
 * Seeded RNG: xoshiro128** with named substreams.
 * Substream seed = sha256(season.seed | tick | domain | entityId) (GAME.md section 2).
 * No Math.random, no clock.
 */
import type { RngDomain } from "@/config/game";
import { sha256Hex, sha256Words } from "./hash";

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Rng {
  private s: Uint32Array;
  draws = 0;

  constructor(state: [number, number, number, number]) {
    this.s = new Uint32Array(state);
    if (this.s[0] === 0 && this.s[1] === 0 && this.s[2] === 0 && this.s[3] === 0) this.s[0] = 1;
  }

  static fromString(s: string): Rng {
    return new Rng(sha256Words(s));
  }

  /** xoshiro128** next */
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    this.draws++;
    return result;
  }

  /** Uniform in [0, 1) with 32 bits of resolution. */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  bool(p: number): boolean {
    return this.next() < p;
  }

  /** Standard normal via Box-Muller (consumes two draws). */
  normal(): number {
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  gaussian(mean: number, sd: number): number {
    return mean + sd * this.normal();
  }

  logNormal(mu: number, sigma: number): number {
    return Math.exp(mu + sigma * this.normal());
  }

  /** Beta(2,2) as the median of three uniforms. */
  beta22(): number {
    const a = [this.next(), this.next(), this.next()].sort((x, y) => x - y);
    return a[1];
  }

  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)];
  }

  shuffle<T>(xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Weighted sampling without replacement (sequential draws). Items with weight <= 0 are never chosen. */
  sampleWeighted<T>(items: readonly T[], weight: (t: T) => number, k: number): T[] {
    const pool = items.map((t) => ({ t, w: Math.max(0, weight(t)) })).filter((x) => x.w > 0);
    const out: T[] = [];
    while (out.length < k && pool.length > 0) {
      const total = pool.reduce((s, x) => s + x.w, 0);
      let r = this.next() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].w;
        if (r < 0) {
          idx = i;
          break;
        }
      }
      out.push(pool[idx].t);
      pool.splice(idx, 1);
    }
    return out;
  }
}

export function substreamKey(seasonSeed: string, tick: number, domain: RngDomain, entityId: string): string {
  return `${seasonSeed}|${tick}|${domain}|${entityId}`;
}

/** The substream for one draw context. */
export function substream(seasonSeed: string, tick: number, domain: RngDomain, entityId: string): Rng {
  return Rng.fromString(substreamKey(seasonSeed, tick, domain, entityId));
}

/** Published at season start. */
export function seedCommitment(seasonSeed: string): string {
  return sha256Hex(seasonSeed);
}

export function verifySeedReveal(seasonSeed: string, commitment: string): boolean {
  return sha256Hex(seasonSeed) === commitment;
}

/** First 6 hex chars of sha256(seed | pitchId), shown in the pitch room. */
export function pitchCommitment(seasonSeed: string, pitchId: string): string {
  return sha256Hex(`${seasonSeed}|${pitchId}`).slice(0, 6);
}
