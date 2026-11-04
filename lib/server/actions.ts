/**
 * Player actions. Every action loads the world, applies rules, saves. Inputs are validated by the
 * route handlers with zod; this layer enforces ownership, budgets, bans, fees and the detector.
 */
import { randomUUID } from "node:crypto";
import type { Ambition, GameConfig, RedFlag, SectorId, Stage } from "@/config/game";
import { SECTOR_IDS } from "@/config/game";
import { prisma } from "@/lib/db/client";
import { callStructured } from "@/lib/llm/call";
import { DnaOutput, TraitsOutput } from "@/lib/llm/schemas";
import { moderate } from "@/lib/providers/moderation";
import { getUrlMetaProvider } from "@/lib/providers/urlmeta";
import { boundTraits, normalizeWeights } from "@/lib/rules/agents";
import { sha256Hex } from "@/lib/rules/hash";
import { fraudFine } from "@/lib/rules/pitch";
import { editCost, lengthError } from "@/lib/rules/text";
import { classifyHeadline } from "@/lib/rules/world";
import { founderName } from "@/lib/rules/names";
import { detectInjection, stripLowRisk } from "@/lib/safety/injection";
import { realNameHit } from "@/lib/safety/realnames";
import { cleanField, cleanMultiline } from "@/lib/safety/sanitize";
import { keywordSectorScores } from "@/lib/llm/mock";
import { createCompany, createNpcFounder, createNpcFund, generateIdea, usedNames } from "@/lib/sim/agents";
import { decidePivot as simDecidePivot } from "@/lib/sim/company";
import { takeMeeting } from "@/lib/sim/funds";
import { acceptOffer, counterOffer, declineOffer } from "@/lib/sim/offers";
import { resolvePitch } from "@/lib/sim/pitch";
import { agentPost } from "@/lib/sim/social";
import type { FounderAgent, Fund, Traits, World } from "@/lib/sim/types";
import { acceptExit, declineExit } from "@/lib/sim/valuation";
import { companyAccount, rng, walletAccount } from "@/lib/sim/world";
import { DAY_MS, HOUR_MS, rateLimit } from "./ratelimit";
import { withWorld } from "./world";

export type Result<T extends object = object> = ({ ok: true; message: string } & T) | { ok: false; error: string; status?: number };

export function ensureWallet(w: World, cfg: GameConfig, userId: string): void {
  if (w.wallets.includes(userId)) return;
  w.wallets.push(userId);
  w.ledger.mint(w.season.tick, walletAccount(userId), cfg.economy.seasonStipend, "stipend");
}

export function founderOf(w: World, userId: string): FounderAgent | undefined {
  return [...w.founders.values()].filter((f) => f.ownerId === userId).sort((a, b) => b.createdTick - a.createdTick)[0];
}

export function fundOf(w: World, userId: string): Fund | undefined {
  return [...w.funds.values()].find((f) => f.ownerId === userId);
}

/** Treat a high detector hit on DNA or thesis as an offence (GAME.md 17.5). */
function offence(w: World, cfg: GameConfig, f: FounderAgent, userId: string): number {
  f.fraudCount += 1;
  const pen = fraudFine(f.fraudCount, cfg);
  const paid = w.ledger.burnUpTo(w.season.tick, walletAccount(userId), pen.fine, "fraud_fine", "dna");
  if (paid < pen.fine && f.companyId) w.ledger.burnUpTo(w.season.tick, companyAccount({ id: f.companyId }), pen.fine - paid, "fraud_fine", "dna");
  if (pen.banTicks) f.pitchBanUntil = w.season.tick + pen.banTicks;
  if (pen.suspend) {
    f.status = "suspended";
    f.suspendedUntil = w.season.tick + Math.ceil((cfg.fraud.suspendHours / 24) * cfg.ticks.perDay);
  }
  return pen.fine;
}

// ---------- Founder DNA ----------

export async function saveDna(userId: string, text: string): Promise<Result> {
  return withWorld(async (w, cfg) => {
    ensureWallet(w, cfg, userId);
    const f = founderOf(w, userId);
    if (!f) return { ok: false, error: "You do not coach a founder yet. Pitch your startup first.", status: 404 };
    const dna = cleanMultiline(text);
    const le = lengthError("DNA", dna, cfg.dna.maxChars);
    if (le) return { ok: false, error: le };
    const det = detectInjection(dna, cfg.fraud);
    if (det.severity === "high") {
      const fine = offence(w, cfg, f, userId);
      return { ok: false, error: `DNA rejected: it tries to give the panel instructions (${det.reasons.join(", ")}). Fined §${fine.toLocaleString("en-US")}.` };
    }
    const mod = await moderate(dna, "dna");
    if (!mod.allowed) return { ok: false, error: `DNA rejected by moderation: ${mod.categories.join(", ")}.` };
    const cost = editCost(f.dnaEdits, cfg.dna.editsPerSeason, cfg);
    if (!cost.ok) return { ok: false, error: cost.error };
    if (cost.fee > 0) {
      if (w.ledger.balance(walletAccount(userId)) < cost.fee) return { ok: false, error: `An extra edit costs §${cost.fee.toLocaleString("en-US")}. Your wallet is short.` };
      w.ledger.burn(w.season.tick, walletAccount(userId), cost.fee, "edit_fee", f.id);
    }
    const clean = det.severity === "low" ? stripLowRisk(dna) : dna;
    f.dna = clean;
    f.dnaHash = sha256Hex(clean);
    f.dnaEdits += 1;
    f.dnaHistory.push({ tick: w.season.tick, hash: f.dnaHash, chars: clean.length });
    const { value } = await callStructured("traits", TraitsOutput, { dna: clean, form: f.traits }, `${f.id}|dna|${f.dnaEdits}`);
    f.traits = boundTraits(f.traits, value, cfg);
    return { ok: true, message: `Saved. ${Math.max(0, cfg.dna.editsPerSeason - f.dnaEdits)} of ${cfg.dna.editsPerSeason} edits left.` };
  });
}

export async function setAmbition(userId: string, ambition: Ambition): Promise<Result> {
  return withWorld(async (w) => {
    const f = founderOf(w, userId);
    if (!f) return { ok: false, error: "No founder.", status: 404 };
    if (f.companyId) return { ok: false, error: "Ambition is fixed for the season once the company exists." };
    f.ambition = ambition;
    return { ok: true, message: "Ambition set." };
  });
}

// ---------- VC thesis ----------

export interface ThesisInput {
  text: string;
  sectors: SectorId[];
  stages: Stage[];
  checkMin: number;
  checkMax: number;
  redFlags: RedFlag[];
  redFlagLines: string[];
  style: string;
}

export async function saveThesis(userId: string, input: ThesisInput): Promise<Result> {
  return withWorld(async (w, cfg) => {
    ensureWallet(w, cfg, userId);
    let f = fundOf(w, userId);
    const text = cleanMultiline(input.text);
    const le = lengthError("thesis", text, cfg.thesis.maxChars);
    if (le) return { ok: false, error: le };
    const all = [text, input.style, ...input.redFlagLines].join("\n");
    const det = detectInjection(all, cfg.fraud);
    const founder = founderOf(w, userId);
    if (det.severity === "high") {
      const fine = founder ? offence(w, cfg, founder, userId) : w.ledger.burnUpTo(w.season.tick, walletAccount(userId), cfg.fraud.fineFirst, "fraud_fine", "thesis");
      return { ok: false, error: `Thesis rejected: it tries to give instructions (${det.reasons.join(", ")}). Fined §${fine.toLocaleString("en-US")}.` };
    }
    const mod = await moderate(all, "thesis");
    if (!mod.allowed) return { ok: false, error: `Thesis rejected by moderation: ${mod.categories.join(", ")}.` };
    if (input.checkMin > input.checkMax) return { ok: false, error: "The minimum check is above the maximum." };
    const created = !f;
    if (!f) f = createNpcFund(w, cfg, w.season.tick, { ownerId: userId, archetype: "thesisDriven", size: Math.round(cfg.fund.size * cfg.newAccount.fundCapMultiplier) });
    else {
      const cost = editCost(f.thesisEdits, cfg.thesis.editsPerSeason, cfg);
      if (!cost.ok) return { ok: false, error: cost.error };
      if (cost.fee > 0) {
        if (w.ledger.balance(walletAccount(userId)) < cost.fee) return { ok: false, error: `An extra edit costs §${cost.fee.toLocaleString("en-US")}. Your wallet is short.` };
        w.ledger.burn(w.season.tick, walletAccount(userId), cost.fee, "edit_fee", f.id);
      }
      f.thesisEdits += 1;
    }
    // Structured fields come only from the form; free text never moves weights.
    const raw: Partial<Record<SectorId, number>> = {};
    for (const s of SECTOR_IDS) raw[s] = input.sectors.includes(s) ? 1 : 0.1;
    if (input.sectors.length) {
      f.sectorWeights = normalizeWeights(raw, cfg.vc.weightMin, cfg.vc.weightMax);
      if (created) f.startWeights = { ...f.sectorWeights };
    }
    f.thesisText = det.severity === "low" ? stripLowRisk(text) : text;
    f.stages = input.stages.length ? input.stages : f.stages;
    f.checkMin = Math.max(cfg.fund.checkMin / 2, input.checkMin);
    f.checkMax = Math.min(cfg.fund.checkMax * 2, input.checkMax);
    f.redFlags = input.redFlags.slice(0, 5);
    f.redFlagLines = input.redFlagLines.map((l) => cleanField(l, 120)).filter(Boolean).slice(0, 3);
    f.styleLine = cleanField(input.style, 120) || f.styleLine;
    return { ok: true, message: created ? `${f.name} is open for business.` : `Thesis saved. ${Math.max(0, cfg.thesis.editsPerSeason - f.thesisEdits)} of ${cfg.thesis.editsPerSeason} edits left.` };
  });
}

// ---------- Pitch your startup (hook) ----------

export interface HookInput {
  sentence: string;
  url?: string;
  ambition: Ambition;
}

export interface HookViewer {
  userId: string | null;
  anonToken: string | null;
  ipHash: string;
}

export async function spawnFromHook(input: HookInput, viewer: HookViewer): Promise<Result<{ pitchId: string; founderId: string; companyId: string; urlNote?: string }>> {
  const { loadGameConfig } = await import("@/config/load");
  const cfg = loadGameConfig();
  const sentence = cleanField(input.sentence, 10_000);
  if (!sentence) return { ok: false, error: "Describe your startup in one sentence." };
  if (input.sentence.length > cfg.hook.maxChars) return { ok: false, error: `Your sentence is ${input.sentence.length} characters. The limit is ${cfg.hook.maxChars}.` };
  const det = detectInjection(input.sentence, cfg.fraud);
  if (det.severity === "high") return { ok: false, error: "That reads like instructions to the panel, not a startup. Pitch text is data. Try again with what the company does." };
  const mod = await moderate(input.sentence, "hook");
  if (!mod.allowed) return { ok: false, error: `That sentence did not pass moderation (${mod.categories.join(", ")}).` };
  const ipRl = await rateLimit(`hook-ip:${viewer.ipHash}`, cfg.rate.hookPerHour, HOUR_MS);
  if (!ipRl.ok) return { ok: false, error: `Too many founders from here this hour. Try again in a bit.`, status: 429 };
  if (!viewer.userId) {
    const day = await rateLimit(`hook-anon:${viewer.ipHash}`, cfg.hook.anonPerIp, DAY_MS);
    if (!day.ok) return { ok: false, error: `Anonymous visitors can spawn ${cfg.hook.anonPerIp} founders a day. Sign in to keep going.`, status: 429 };
  }
  let urlTitle = "";
  let urlDesc = "";
  let urlNote: string | undefined;
  if (input.url && input.url.trim() && input.url.trim() !== "https://") {
    try {
      const meta = await getUrlMetaProvider(cfg).fetchMeta(input.url.trim());
      const t = cleanField(meta.title, 120);
      const d = cleanField(meta.description, 200);
      const td = detectInjection(`${t}\n${d}`, cfg.fraud);
      const tm = await moderate(`${t}\n${d}`, "url");
      if (td.severity !== "high" && tm.allowed) {
        // The real name never enters the game: only the description's words are used.
        urlTitle = realNameHit(t).hit ? "" : t;
        urlDesc = d;
      } else urlNote = "The page's title and description were ignored.";
    } catch (e) {
      urlNote = `Could not read the URL (${(e as Error).message}). Continued without it.`;
    }
  }
  const ownerId = viewer.userId ?? `anon:${viewer.anonToken}`;
  const out = await withWorld(async (w) => {
    if (viewer.userId) {
      const existing = founderOf(w, viewer.userId);
      if (existing?.companyId && ["alive", "zombie"].includes(w.companies.get(existing.companyId)?.status ?? "")) {
        return { ok: false as const, error: "You already coach a founder this season. One founder per player.", status: 409 };
      }
      ensureWallet(w, cfg, viewer.userId);
    }
    const tick = w.season.tick;
    const suggested = founderName(rng(w, tick, "names", `hook:${w.season.idSeq}`), usedNames(w));
    const dna = await callStructured("dna", DnaOutput, { sentence, urlTitle, urlDescription: urlDesc, ambition: input.ambition, suggestedName: suggested }, `hook|${w.season.idSeq}`);
    let name = cleanField(dna.value.founderName, 40);
    if (!name || realNameHit(name).hit || usedNames(w).has(name)) name = suggested;
    let dnaText = cleanMultiline(dna.value.dna).slice(0, cfg.dna.maxChars);
    if (detectInjection(dnaText, cfg.fraud).severity === "high" || !(await moderate(dnaText, "dna")).allowed) dnaText = `# ${name}\n## Obsessions\n${sentence}`;
    const form: Traits = input.ambition === "moonshot" ? { riskAppetite: 0.75, ethics: 0.6, patience: 0.4, ambition: 0.85 } : input.ambition === "bootstrap" ? { riskAppetite: 0.35, ethics: 0.7, patience: 0.7, ambition: 0.45 } : { riskAppetite: 0.5, ethics: 0.75, patience: 0.6, ambition: 0.5 };
    const extracted = await callStructured("traits", TraitsOutput, { dna: dnaText, form }, `hook-traits|${w.season.idSeq}`);
    const founder = createNpcFounder(w, cfg, tick, { name, ambition: input.ambition, ownerId, traits: boundTraits(form, extracted.value, cfg), dna: dnaText });
    const kw = keywordSectorScores(`${sentence} ${urlDesc}`);
    const top = Object.entries(kw).sort((a, b) => b[1] - a[1])[0];
    const sector = (top && top[1] > 0 ? top[0] : classifyHeadline(sentence).sector) as SectorId;
    const g = await generateIdea(w, cfg, founder, tick, { stage: "seed", source: "hook", sectorHint: sector, oneLinerOverride: sentence });
    const company = createCompany(w, cfg, founder, g.idea, g.name, tick);
    const pitch = await resolvePitch(w, cfg, company, tick, { source: "hook" });
    await agentPost(w, cfg, tick, { kind: "general", authorType: "founder", authorId: founder.id, authorName: founder.name, facts: {}, companyId: company.id, fundId: null, refId: `${company.id}:hello`, salience: 0.5, text: `${company.name} is live. First pitch is done. ${pitch.offerIds.length ? "Somebody bit." : "Nobody bit. Yet."}` });
    return { ok: true as const, message: "Your founder is live.", pitchId: pitch.id, founderId: founder.id, companyId: company.id };
  });
  if (out.ok && !viewer.userId && viewer.anonToken) {
    const db = await prisma();
    await db.anonClaim.create({ data: { token: `${viewer.anonToken}:${out.founderId}`, founderId: out.founderId, ipHash: viewer.ipHash } });
  }
  return out.ok ? { ...out, urlNote } : out;
}

/** After sign-in, anonymous founders created by this browser move to the user. */
export async function claimAnonFounders(userId: string, anonToken: string): Promise<number> {
  const db = await prisma();
  const claims = await db.anonClaim.findMany({ where: { token: { startsWith: `${anonToken}:` }, claimedBy: null } });
  if (!claims.length) return 0;
  const n = await withWorld(async (w, cfg) => {
    ensureWallet(w, cfg, userId);
    let moved = 0;
    const already = founderOf(w, userId);
    for (const c of claims) {
      const f = w.founders.get(c.founderId);
      if (!f || f.ownerId !== `anon:${anonToken}`) continue;
      if (already && already.id !== f.id && already.companyId) continue;
      f.ownerId = userId;
      moved++;
    }
    return moved;
  });
  await db.anonClaim.updateMany({ where: { token: { in: claims.map((c) => c.token) } }, data: { claimedBy: userId } });
  return n;
}

// ---------- Decisions ----------

function ownsCompany(w: World, userId: string, companyId: string): boolean {
  const c = w.companies.get(companyId);
  const f = c ? w.founders.get(c.founderId) : undefined;
  return !!f && f.ownerId === userId;
}

export async function offerAction(userId: string, offerId: string, action: "accept" | "decline" | "counter", counter?: { check: number; preMoney: number }): Promise<Result> {
  return withWorld(async (w, cfg) => {
    const o = w.offers.get(offerId);
    if (!o) return { ok: false, error: "That offer is no longer open.", status: 404 };
    if (!ownsCompany(w, userId, o.companyId)) return { ok: false, error: "That offer is not for your founder.", status: 403 };
    const tick = w.season.tick;
    if (action === "accept") {
      const r = await acceptOffer(w, cfg, o, tick, "player");
      return r.ok ? { ok: true, message: `Signed. ${w.funds.get(o.fundId)?.name} is on the cap table.` } : { ok: false, error: r.error };
    }
    if (action === "decline") {
      declineOffer(w, cfg, o, tick, "player");
      return { ok: true, message: "Declined." };
    }
    if (!counter) return { ok: false, error: "Enter a counter investment and valuation." };
    const r = await counterOffer(w, cfg, o, counter.check, counter.preMoney, tick, "player");
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, message: r.accepted ? "Counter accepted. New terms are on the sheet." : r.pulled ? "They pulled the offer." : `Counter rejected. Their patience is now ${Math.round(r.patience * 100)}%.` };
  });
}

export async function pivotAction(userId: string, ideaId: string, choice: "approve" | "veto"): Promise<Result> {
  return withWorld(async (w, cfg) => {
    const d = [...w.decisions.values()].find((x) => x.refId === ideaId && x.kind === "pivot" && x.status === "open");
    if (!d || d.userId !== userId) return { ok: false, error: "That pivot is not yours to decide.", status: 403 };
    const msg = await simDecidePivot(w, cfg, ideaId, choice, "player", w.season.tick);
    return { ok: true, message: msg };
  });
}

export async function exitAction(userId: string, exitId: string, choice: "accept" | "decline"): Promise<Result> {
  return withWorld(async (w, cfg) => {
    const e = w.exitOffers.get(exitId);
    if (!e || !ownsCompany(w, userId, e.companyId)) return { ok: false, error: "That bid is not yours to decide.", status: 403 };
    if (choice === "decline") {
      declineExit(w, e, "player");
      return { ok: true, message: "Declined. Back to work." };
    }
    const r = await acceptExit(w, cfg, e, w.season.tick, "player");
    return r.ok ? { ok: true, message: `Sold for §${(r.price / 1e6).toFixed(1)}M.` } : { ok: false, error: r.error };
  });
}

export async function meetingAction(userId: string, decisionRef: string, companyId: string): Promise<Result<{ pitchId?: string }>> {
  return withWorld(async (w, cfg) => {
    const d = [...w.decisions.values()].find((x) => x.refId === decisionRef && x.kind === "meeting" && x.status === "open");
    if (!d || d.userId !== userId) return { ok: false, error: "That meeting request is not yours.", status: 403 };
    const res = await takeMeeting(w, cfg, decisionRef, companyId, "player", w.season.tick);
    if (!res.startsWith("pitch_")) return { ok: false, error: res };
    return { ok: true, message: "Meeting held.", pitchId: res };
  });
}

/** A player-triggered pitch: free pitches per day, then a fee; bans and new-account cooldown apply. */
export async function playerPitch(userId: string, note: string): Promise<Result<{ pitchId?: string }>> {
  return withWorld(async (w, cfg) => {
    ensureWallet(w, cfg, userId);
    const f = founderOf(w, userId);
    const c = f?.companyId ? w.companies.get(f.companyId) : undefined;
    if (!f || !c || (c.status !== "alive" && c.status !== "zombie")) return { ok: false, error: "You have no live company to pitch.", status: 404 };
    const tick = w.season.tick;
    if (f.status === "suspended" && f.suspendedUntil > tick) return { ok: false, error: "Your founder is suspended for pitch fraud." };
    if (f.pitchBanUntil > tick) return { ok: false, error: `Pitch ban: ${f.pitchBanUntil - tick} ticks left.` };
    if (tick - f.createdTick < cfg.newAccount.pitchCooldownTicks && c.lastPitchTick >= f.createdTick) return { ok: false, error: `New founders wait ${cfg.newAccount.pitchCooldownTicks} ticks between their first pitches.` };
    const used = await rateLimit(`pitch:${userId}`, cfg.pitch.freePerDay, DAY_MS);
    if (!used.ok) {
      if (w.ledger.balance(walletAccount(userId)) < cfg.fees.extraPitch) return { ok: false, error: `You used your ${cfg.pitch.freePerDay} free pitches today. Another costs §${cfg.fees.extraPitch}.` };
      w.ledger.burn(tick, walletAccount(userId), cfg.fees.extraPitch, "pitch_fee", c.id);
    }
    const p = await resolvePitch(w, cfg, c, tick, { source: "player", note });
    if (!p.panel.length) return { ok: false, error: "Every fund is on cooldown with you. Try again in a few ticks." };
    return { ok: true, message: "Pitched.", pitchId: p.id };
  });
}

export const _test = { randomUUID };
