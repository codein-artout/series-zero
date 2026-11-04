import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/game/page";
import { PitchReplay, type ReplayData } from "@/components/game/pitch-replay";
import { config, getPerspective, getPitch, getWorld } from "@/lib/server/view";
import { initials, scripShort } from "@/lib/format";
import { prisma } from "@/lib/db/client";
import type { Company, FounderAgent, Idea } from "@/lib/sim/types";

export const metadata: Metadata = { title: "Pitch Room" };
export const dynamic = "force-dynamic";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five"];
const word = (n: number) => WORDS[n] ?? String(n);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default async function PitchPage({ params }: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await params;
  const pitch = await getPitch(pitchId);
  if (!pitch) notFound();
  const [w, p] = await Promise.all([getWorld(), getPerspective()]);
  const cfg = config();
  const db = await prisma();
  const companyRow = w.companies.get(pitch.companyId) ?? ((await db.company.findUnique({ where: { id: pitch.companyId } }))?.state as unknown as Company | undefined);
  const founder = w.founders.get(pitch.founderId) ?? ((await db.founder.findUnique({ where: { id: pitch.founderId } }))?.state as unknown as FounderAgent | undefined);
  const idea = w.ideas.get(pitch.ideaId) ?? ((await db.idea.findUnique({ where: { id: pitch.ideaId } }))?.state as unknown as Idea | undefined);
  if (!companyRow || !founder || !idea) notFound();
  const seats = pitch.reactions.map((r) => {
    const f = w.funds.get(r.fundId);
    const name = f?.name ?? "A fund";
    return {
      fundId: r.fundId,
      name,
      short: name.split(" ")[0],
      initial: initials(name).slice(0, 1),
      personality: f ? cfg.vc.archetypes[f.archetype].label : "Fund",
      brass: f?.archetype === "hypeChaser",
      reaction: r.text,
      interest: r.interest,
      fit: r.fit,
      flags: r.redFlags.length,
      p: r.p,
      roll: r.roll,
      offer: r.offer,
    };
  });
  const offers = seats.filter((s) => s.offer).length;
  const passes = seats.length - offers;
  const fraud = pitch.fraud.severity === "high";
  const owner = founder.ownerId === p.userId && p.canAct;
  const stageName = pitch.stage === "seriesA" ? "Series A" : pitch.stage === "preseed" ? "Pre-seed" : "Seed";
  const data: ReplayData = {
    pitchId: pitch.id,
    label: `${stageName} round · Tick ${pitch.tick}`,
    founder: { name: founder.name, initials: initials(founder.name), company: companyRow.name },
    pitchLine: `${esc(idea.oneLiner.replace(/\.?$/, "."))} Asking <b class="num br">${scripShort(pitch.ask)}</b> on <b class="num br">${scripShort(pitch.askPre)}</b> pre.`,
    slides: (idea.slides && idea.slides.length === 4 ? idea.slides : ["The problem", "How it makes money", "Early signs", "The ask"]).map((s, i) => (i === 3 ? "The ask" : s)),
    metaInstructions: pitch.fraud.reasons.length,
    fraud,
    fraudLine: `Pitch fraud: ${pitch.fraud.reasons.join(", ")}. Fined §${pitch.fraud.fine.toLocaleString("en-US")}.`,
    rubric: [
      { label: "Clarity", value: pitch.rubric.clarity },
      { label: "Market", value: pitch.rubric.market },
      { label: "Traction", value: pitch.rubric.traction },
      { label: "Team", value: pitch.rubric.team },
      { label: "Defensibility", value: pitch.rubric.defensibility },
    ],
    commitment: pitch.commitment,
    seats,
    offerHref: pitch.offerIds[0] ? `/offers/${pitch.offerIds[0]}` : null,
    verdictTitle: fraud ? ["Pitch fraud.", "Score zeroed."] : [`${word(offers)} term sheet${offers === 1 ? "" : "s"},`, `${word(passes).toLowerCase()} stamp${passes === 1 ? "" : "s"}.`],
    offers,
    passes,
    shareForms: owner && !fraud ? seats.filter((s) => !s.offer).map((s) => ({ fundId: s.fundId, name: s.name })) : [],
    canAct: p.canAct,
  };
  return (
    <Page active="pitch">
      <PitchReplay d={data} />
    </Page>
  );
}
