import { describe, expect, it } from "vitest";
import { Rng, pitchCommitment, seedCommitment, substream, verifySeedReveal } from "@/lib/rules/rng";
import { mean, percentileRanks, median } from "@/lib/rules/math";

describe("xoshiro128** RNG", () => {
  it("is deterministic for the same seed", () => {
    const a = Rng.fromString("s");
    const b = Rng.fromString("s");
    const xs = Array.from({ length: 100 }, () => a.nextU32());
    const ys = Array.from({ length: 100 }, () => b.nextU32());
    expect(xs).toEqual(ys);
  });

  it("matches the reference xoshiro128** sequence for state [1,2,3,4]", () => {
    // Reference values from the public-domain C implementation by Blackman & Vigna.
    const r = new Rng([1, 2, 3, 4]);
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([11520, 0, 5927040, 70819200]);
  });

  it("substreams are independent by tick, domain and entity", () => {
    const base = substream("seed", 1, "pitch", "p1").next();
    expect(substream("seed", 1, "pitch", "p1").next()).toBe(base);
    expect(substream("seed", 2, "pitch", "p1").next()).not.toBe(base);
    expect(substream("seed", 1, "offer", "p1").next()).not.toBe(base);
    expect(substream("seed", 1, "pitch", "p2").next()).not.toBe(base);
    expect(substream("other", 1, "pitch", "p1").next()).not.toBe(base);
  });

  it("drawing from one substream does not change another", () => {
    const a1 = substream("seed", 5, "luck", "c1");
    const b = substream("seed", 5, "luck", "c2");
    const first = b.next();
    for (let i = 0; i < 50; i++) a1.next();
    const b2 = substream("seed", 5, "luck", "c2");
    expect(b2.next()).toBe(first);
  });

  it("has sane distributions", () => {
    const r = Rng.fromString("dist");
    const u = Array.from({ length: 20000 }, () => r.next());
    expect(Math.min(...u)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...u)).toBeLessThan(1);
    expect(mean(u)).toBeCloseTo(0.5, 1);
    const buckets = new Array(10).fill(0);
    u.forEach((x) => buckets[Math.floor(x * 10)]++);
    buckets.forEach((b) => expect(Math.abs(b - 2000)).toBeLessThan(200));
    const n = Array.from({ length: 20000 }, () => r.normal());
    expect(mean(n)).toBeCloseTo(0, 1);
    const sd = Math.sqrt(mean(n.map((x) => x * x)));
    expect(sd).toBeGreaterThan(0.95);
    expect(sd).toBeLessThan(1.05);
    const b = Array.from({ length: 20000 }, () => r.beta22());
    expect(mean(b)).toBeCloseTo(0.5, 1);
    // Beta(2,2) variance is 0.05
    expect(mean(b.map((x) => (x - 0.5) ** 2))).toBeCloseTo(0.05, 2);
    const ln = Array.from({ length: 20000 }, () => r.logNormal(0.7, 0.8));
    expect(median(ln)).toBeGreaterThan(1.8);
    expect(median(ln)).toBeLessThan(2.25);
  });

  it("weighted sampling never repeats and never picks zero weights", () => {
    const r = Rng.fromString("w");
    for (let i = 0; i < 200; i++) {
      const s = r.sampleWeighted(["a", "b", "c", "d", "z"], (x) => (x === "z" ? 0 : 1), 3);
      expect(new Set(s).size).toBe(3);
      expect(s).not.toContain("z");
    }
  });

  it("commitment and reveal", () => {
    const c = seedCommitment("abc");
    expect(c).toHaveLength(64);
    expect(verifySeedReveal("abc", c)).toBe(true);
    expect(verifySeedReveal("abd", c)).toBe(false);
    expect(pitchCommitment("abc", "pitch1")).toMatch(/^[0-9a-f]{6}$/);
  });
});

describe("math helpers", () => {
  it("percentile ranks average ties", () => {
    expect(percentileRanks([10, 20, 20, 40])).toEqual([0, 0.5, 0.5, 1]);
    expect(percentileRanks([5])).toEqual([0.5]);
    expect(percentileRanks([3, 3, 3])).toEqual([0.5, 0.5, 0.5]);
  });
});
