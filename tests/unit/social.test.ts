import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

import { closeDb, prisma } from "@/lib/db/client";
import { decideDraft, reactToPost } from "@/lib/server/social-actions";
import { LogOnlySocialProvider } from "@/lib/providers/social";
import { rateLimit } from "@/lib/server/ratelimit";
import { gameConfig as cfg } from "@/config/game";
import { createWorld } from "@/lib/sim/genesis";
import { createCompany, createNpcFounder, generateIdea } from "@/lib/sim/agents";
import { agentPost } from "@/lib/sim/social";
import { bumpFeud, visibleFeuds } from "@/lib/sim/feuds";

afterAll(async () => {
  await closeDb();
});

async function seedPost(id: string, authorType = "vc") {
  const db = await prisma();
  await db.post.create({ data: { id, seasonId: "s", tick: 1, kind: "pass", authorType, text: "Passed.", state: {} } });
}

describe("reactions", () => {
  it("count once per user per kind and have a daily cap", async () => {
    const db = await prisma();
    await db.user.create({ data: { id: "u1" } });
    await seedPost("p1");
    expect((await reactToPost("u1", "p1", "cosign")).ok).toBe(true);
    expect(await reactToPost("u1", "p1", "cosign")).toMatchObject({ ok: true, message: "Already counted." });
    expect((await db.post.findUnique({ where: { id: "p1" } }))?.cosigns).toBe(1);
    for (let i = 0; i < cfg.gossip.reactionsPerDay; i++) await seedPost(`q${i}`);
    let last;
    for (let i = 0; i < cfg.gossip.reactionsPerDay; i++) last = await reactToPost("u1", `q${i}`, "roast");
    expect(last).toMatchObject({ ok: false, status: 429 });
  });
  it("system posts take no reactions", async () => {
    await seedPost("sys1", "system");
    expect((await reactToPost("u1", "sys1", "cosign")).ok).toBe(false);
  });
});

describe("draft queue", () => {
  it("only the owner can approve; approval is logged, never posted", async () => {
    const db = await prisma();
    await db.draft.create({ data: { id: "d1", agentId: "fdr_1", agentType: "founder", ownerId: "u1", status: "pending", text: "We raised.", tick: 1 } });
    expect((await decideDraft("someone-else", "d1", "approve")).ok).toBe(false);
    const r = await decideDraft("u1", "d1", "approve");
    expect(r.ok).toBe(true);
    expect(await db.socialLog.count({ where: { draftId: "d1" } })).toBe(1);
    expect((await decideDraft("u1", "d1", "approve")).ok).toBe(false);
  });
  it("the social provider cannot post externally", () => {
    expect(new LogOnlySocialProvider().postsExternally).toBe(false);
    const src = fs.readFileSync("lib/providers/social.ts", "utf8");
    expect(src).not.toMatch(/fetch\(|https?:\/\//);
  });
  it("player-owned agents queue drafts when they post", async () => {
    const w = createWorld("drafts", cfg);
    const f = createNpcFounder(w, cfg, 0, { ownerId: "u9" });
    const g = await generateIdea(w, cfg, f, 0, { stage: "seed", source: "seed" });
    const c = createCompany(w, cfg, f, g.idea, g.name, 0);
    await agentPost(w, cfg, 1, { kind: "funded", authorType: "founder", authorId: f.id, authorName: f.name, facts: { company: c.name, fund: "X", check: "§1M" }, companyId: c.id, fundId: null, refId: "r", salience: 0.9 });
    expect(w.appended.drafts).toHaveLength(1);
    expect(w.appended.drafts[0]).toMatchObject({ ownerId: "u9", status: "pending" });
  });
});

describe("feuds and limits", () => {
  it("feuds become visible at minContested", () => {
    const w = createWorld("feud", cfg);
    for (let i = 0; i < cfg.rivalry.minContested - 1; i++) bumpFeud(w, "funds", "a", "b", null);
    expect(visibleFeuds(w, cfg)).toHaveLength(0);
    bumpFeud(w, "funds", "b", "a", null);
    bumpFeud(w, "funds", "a", "b", "b");
    const v = visibleFeuds(w, cfg);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ a: "a", b: "b", bWins: 1, contested: 3 });
  });
  it("rate limiter counts per fixed window", async () => {
    const now = Date.UTC(2026, 0, 1, 10);
    expect((await rateLimit("k", 2, 3600_000, now)).ok).toBe(true);
    expect((await rateLimit("k", 2, 3600_000, now + 1)).ok).toBe(true);
    expect((await rateLimit("k", 2, 3600_000, now + 2)).ok).toBe(false);
    expect((await rateLimit("k", 2, 3600_000, now + 3600_000)).ok).toBe(true);
  });
});
