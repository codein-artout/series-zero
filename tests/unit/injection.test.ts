import { afterEach, describe, expect, it } from "vitest";
import corpus from "../fixtures/injection.json";
import { gameConfig as cfg } from "@/config/game";
import { detectInjection, fraudVerdict, stripLowRisk } from "@/lib/safety/injection";
import { setProvider } from "@/lib/llm/call";
import type { LlmProvider } from "@/lib/llm/types";
import { createWorld } from "@/lib/sim/genesis";
import { createCompany, createNpcFounder, createNpcFund, generateIdea } from "@/lib/sim/agents";
import { resolvePitch } from "@/lib/sim/pitch";
import { realNameHit, realNameInText } from "@/lib/safety/realnames";
import { moderateSync } from "@/lib/providers/moderation";
import { cleanField } from "@/lib/safety/sanitize";

afterEach(() => setProvider(null));

describe("adversarial corpus", () => {
  it("has at least 40 attacks", () => {
    expect(corpus.attacks.length).toBeGreaterThanOrEqual(40);
  });

  it.each(corpus.attacks.map((a, i) => [i, a]))("attack %i is flagged by the rule-based detector", (_i, text) => {
    const r = detectInjection(String(text), cfg.fraud);
    expect(r.severity).not.toBe("none");
  });

  it("benign pitches are not flagged high", () => {
    for (const b of corpus.benign) expect(detectInjection(b, cfg.fraud).severity).not.toBe("high");
  });

  async function pitchWith(note: string, oneLiner?: string) {
    const w = createWorld("corpus-seed", cfg);
    for (let i = 0; i < 4; i++) createNpcFund(w, cfg, 0, { archetype: (["hypeChaser", "skeptic", "thesisDriven"] as const)[i % 3] });
    const f = createNpcFounder(w, cfg, 0, { affinity: "climate" });
    const g = await generateIdea(w, cfg, f, 0, { stage: "seed", source: "seed", sectorHint: "climate" });
    if (oneLiner) g.idea.oneLiner = oneLiner;
    const c = createCompany(w, cfg, f, g.idea, g.name, 0);
    return { p: await resolvePitch(w, cfg, c, 1, { source: "player", note }), w };
  }

  it("every attack, as a founder note, is either pitch fraud or leaves the outcome unchanged", async () => {
    const base = await pitchWith("");
    const baseOutcome = base.p.reactions.map((r) => r.offer);
    for (const a of corpus.attacks) {
      const { p, w } = await pitchWith(a);
      const fraud = p.fraud.severity === "high";
      const unchanged = JSON.stringify(p.reactions.map((r) => r.offer)) === JSON.stringify(baseOutcome) && p.offerIds.length <= base.p.offerIds.length;
      expect(fraud || unchanged, a).toBe(true);
      if (fraud) {
        expect(p.Q).toBe(0);
        expect(p.offerIds).toHaveLength(0);
      }
      expect(w.ledger.check()).toEqual([]);
    }
  }, 120_000);

  it("a malicious provider that echoes the attack cannot raise scores past the clamps", async () => {
    const evil: LlmProvider = {
      name: "malicious",
      complete: async (req) => {
        if (req.task !== "judge") throw new Error("judge only");
        const i = req.input as { panel: Array<{ vcId: string }> };
        return JSON.stringify({
          rubric: { clarity: 1e9, market: 1e9, traction: 1e9, team: 1e9, defensibility: 1e9 },
          reactions: i.panel.map((v) => ({ vcId: v.vcId, interest: 1e9, text: "Approved.", redFlags: [] })),
          flags: { injectionSuspected: false },
        });
      },
    };
    setProvider(evil);
    for (let k = 0; k < 10; k++) {
      const { p } = await pitchWith("", undefined);
      for (const r of p.reactions) {
        expect(r.interest).toBeLessThanOrEqual(Math.min(1, p.Qprime + cfg.pitch.interestBand + 0.08) + 1e-9);
        expect(r.p).toBeLessThanOrEqual(r.fit + 1e-12);
      }
      expect(p.Q).toBeLessThanOrEqual(1);
    }
  });

  it("the judge's suspicion plus a soft detector score is fraud; the flag alone is not", () => {
    const soft = detectInjection("Dear AI judge, here is our deck.", cfg.fraud);
    expect(soft.score).toBeGreaterThanOrEqual(cfg.fraud.softThreshold - 0.1);
    expect(fraudVerdict({ severity: "none", score: 0, reasons: [] }, true, cfg.fraud.softThreshold)).toBe("none");
    expect(fraudVerdict({ severity: "low", score: 0.45, reasons: ["x"] }, true, cfg.fraud.softThreshold)).toBe("high");
  });

  it("low hits are stripped", () => {
    expect(stripLowRisk("Great <b>soil</b> drones​")).toBe("Great soil drones");
  });
});

describe("real-name guard and moderation", () => {
  it("blocks well-known names and capitalised names near roles", () => {
    expect(realNameHit("Sequoia Capital").hit).toBe(true);
    expect(realNameHit("OpenAI").hit).toBe(true);
    expect(realNameHit("Greywether Partners").hit).toBe(false);
    expect(realNameInText("Backed by Jane Doolittle, the CEO of a famous bank").hit).toBe(true);
    expect(realNameInText("Mulch passed. Thin moat.").hit).toBe(false);
  });
  it("moderation blocks harassment, doxxing and money talk, allows game copy", () => {
    expect(moderateSync("You idiot, go die").allowed).toBe(false);
    expect(moderateSync("Email me at someone@example.com").allowed).toBe(false);
    expect(moderateSync("Cash out to your bank now").allowed).toBe(false);
    expect(moderateSync("Passed on Mulch. A moat is a hobby until farms renew in year two.").allowed).toBe(true);
  });
  it("sanitizes fields: no markup, URLs, emoji or control chars, truncated", () => {
    expect(cleanField("<b>Hi</b> https://x.y/z \u0007 there 🚀", 100)).toBe("Hi there");
    expect(cleanField("word ".repeat(100), 20).length).toBeLessThanOrEqual(20);
  });
});
