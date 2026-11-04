import { describe, expect, it } from "vitest";
import { defaultGameConfig, deepMerge, seasonTicks, validateGameConfig } from "@/config/game";

describe("game config", () => {
  it("defaults validate and match GAME.md headline numbers", () => {
    const c = validateGameConfig(defaultGameConfig);
    expect(seasonTicks(c)).toBe(270);
    expect(c.pitch.interestBand).toBe(0.35);
    expect(c.fund.size).toBe(60_000_000);
    expect(c.sectors.find((s) => s.id === "ai_infra")?.basePoolAnnual).toBe(62_400_000);
  });
  it("rejects bad overrides", () => {
    expect(() => validateGameConfig(deepMerge(defaultGameConfig, { pitch: { rubricWeights: { clarity: 0.5 } } }))).toThrow();
    expect(() => validateGameConfig(deepMerge(defaultGameConfig, { fund: { size: "big" } }))).toThrow();
    expect(() => validateGameConfig(deepMerge(defaultGameConfig, { unknownKey: 1 }))).toThrow();
  });
  it("accepts a valid partial override", () => {
    const c = validateGameConfig(deepMerge(defaultGameConfig, { fees: { extraPitch: 500 } }));
    expect(c.fees.extraPitch).toBe(500);
    expect(c.fees.closeRate).toBe(0.01);
  });
});
