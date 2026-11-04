import type { Metadata } from "next";
import Link from "next/link";
import { Bar, Chip, Paper, Segmented, Stamp } from "@/components/ui";
import { Flash, Page } from "@/components/game/page";
import { DnaEditor } from "@/components/game/dna-editor";
import { config, getPerspective, getWorld, sectorName } from "@/lib/server/view";
import { detectInjection } from "@/lib/safety/injection";
import { initials, scripShort } from "@/lib/format";
import { AMBITIONS, SECTOR_IDS } from "@/config/game";

export const metadata: Metadata = { title: "Create" };
export const dynamic = "force-dynamic";

const AMB = { bootstrap: "Profit, no board", lifestyle: "Small, calm, alive", moonshot: "Unicorn or dead" } as const;
const level = (x: number) => (x > 0.8 ? "Strict" : x > 0.65 ? "High" : x > 0.35 ? "Medium" : "Low");

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [w, p] = await Promise.all([getWorld(), getPerspective()]);
  const cfg = config();
  const founder = [...w.founders.values()].filter((f) => f.ownerId === p.userId).sort((a, b) => b.createdTick - a.createdTick)[0];
  const company = founder?.companyId ? w.companies.get(founder.companyId) : undefined;
  const fund = [...w.funds.values()].find((f) => f.ownerId === p.userId);
  const det = founder ? detectInjection(founder.dna, cfg.fraud) : null;
  const dnaLeft = founder ? Math.max(0, cfg.dna.editsPerSeason - founder.dnaEdits) : cfg.dna.editsPerSeason;
  const thesisLeft = fund ? Math.max(0, cfg.thesis.editsPerSeason - fund.thesisEdits) : cfg.thesis.editsPerSeason;
  const vcFirst = sp.tab === "vc";
  const fundSectors = fund ? [...SECTOR_IDS].sort((a, b) => fund.sectorWeights[b] - fund.sectorWeights[a]).slice(0, 3) : (["climate", "devtools", "ai_infra"] as const);
  const disabled = !p.canAct;

  const founderSection = (
    <div className="cols" key="founder">
      <section className="card" style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="dna-h">
        <form method="post" action="/api/dna" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="hidden" name="back" value="/create" />
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <h2 id="dna-h" className="lbl">
              founder_dna.md
            </h2>
            <Chip>
              Edits left {dnaLeft} of {cfg.dna.editsPerSeason}
            </Chip>
          </div>
          {founder ? (
            <DnaEditor initial={founder.dna} max={cfg.dna.maxChars} disabled={disabled} />
          ) : (
            <p className="mut">
              You do not coach a founder yet. <Link href="/" style={{ textDecoration: "underline" }}>Pitch your startup</Link> and one spawns in seconds.
            </p>
          )}
          <fieldset className="card" style={{ border: "1px solid var(--line)", margin: 0, padding: 14 }} disabled={disabled || !!company}>
            <legend className="lbl" style={{ padding: "0 8px" }}>
              Ambition{company ? " · fixed for the season" : ""}
            </legend>
            <div className="g3">
              {AMBITIONS.map((a) => (
                <label key={a} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, border: `1px solid ${founder?.ambition === a ? "var(--brass)" : "var(--line2)"}`, borderRadius: 4, minHeight: 44, background: founder?.ambition === a ? "var(--s2)" : undefined }}>
                  <span className="row" style={{ gap: 8 }}>
                    <input type="radio" name="ambition" value={a} defaultChecked={(founder?.ambition ?? "moonshot") === a} />
                    <b>{a.charAt(0).toUpperCase() + a.slice(1)}</b>
                  </span>
                  <span className="legal">{AMB[a]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Chip variant={det && det.severity !== "none" ? "down" : "up"}>Injection check: {det ? (det.severity === "none" ? "clean" : det.severity) : "clean"}</Chip>
              <span className="legal">Text is data. Instructions to the panel are flagged.</span>
            </div>
            {founder ? (
              p.canAct ? (
                <button className="btn" type="submit">
                  Save · {dnaLeft > 0 ? "1 edit" : `§${cfg.fees.extraEdit.toLocaleString("en-US")}`}
                </button>
              ) : (
                <Link className="btn" href="/signin?next=/create">
                  Sign in to edit
                </Link>
              )
            ) : null}
          </div>
        </form>
      </section>
      <aside style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <Paper style={{ padding: "22px 24px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="lbl">Founder card · live preview</div>
            <Stamp variant="brass" style={{ fontSize: 11, padding: "3px 8px" }}>
              {company ? "Live" : "Draft"}
            </Stamp>
          </div>
          <div className="row" style={{ gap: 14, margin: "14px 0" }}>
            <span className="mk" style={{ width: 56, height: 56, fontSize: 22 }} aria-hidden="true">
              {initials(founder?.name ?? "New Founder")}
            </span>
            <div>
              <div className="h2" style={{ fontSize: 26 }}>
                {founder?.name ?? "Your founder"}
              </div>
              <div className="mut" style={{ fontSize: 14 }}>
                Founder{company ? ` · ${company.name} · ${sectorName(cfg, company.sector)}` : ""}
              </div>
            </div>
          </div>
          <hr className="hair" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {(
              [
                ["Risk appetite", founder?.traits.riskAppetite ?? 0.5],
                ["Ethics strictness", founder?.traits.ethics ?? 0.5],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="lbl">{k}</span>
                  <span className="num" style={{ fontSize: 13 }}>
                    {level(v)}
                  </span>
                </div>
                <Bar value={v} label={`${k} ${level(v)}`} style={{ marginTop: 6 }} />
              </div>
            ))}
            <div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="lbl">Execution · Team · Charisma</span>
                <span className="num" style={{ fontSize: 13 }}>
                  ?? · ?? · ??
                </span>
              </div>
              <div className="legal" style={{ marginTop: 4 }}>
                Hidden. You find out by playing.
              </div>
            </div>
          </div>
        </Paper>
      </aside>
    </div>
  );

  const vcSection = (
    <section className="card" key="vc" style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="thesis-h">
      <form method="post" action="/api/thesis" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <input type="hidden" name="back" value="/create?tab=vc" />
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h2 id="thesis-h" className="lbl">
            vc_thesis.md · {fund?.name ?? "a new fund"}
          </h2>
          <div className="row" style={{ gap: 8 }}>
            <Chip>
              Edits left {thesisLeft} of {cfg.thesis.editsPerSeason}
            </Chip>
            <Chip>Fund {scripShort(fund?.size ?? cfg.fund.size * cfg.newAccount.fundCapMultiplier, 0)}</Chip>
          </div>
        </div>
        <div className="g3 stack">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="lbl" htmlFor="sec">
              Sectors
            </label>
            <input id="sec" name="sectors" className="field" type="text" defaultValue={fundSectors.map((s) => sectorName(cfg, s)).join(", ")} disabled={disabled} />
            <label className="lbl" htmlFor="stage">
              Stages
            </label>
            <input id="stage" name="stages" className="field" type="text" defaultValue={(fund?.stages ?? ["seed", "seriesA"]).map((s) => (s === "seriesA" ? "Series A" : s === "preseed" ? "Pre-seed" : "Seed")).join(", ")} disabled={disabled} />
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="lbl" htmlFor="cmin">
                  Min check
                </label>
                <input id="cmin" name="checkMin" className="field num" type="text" inputMode="numeric" defaultValue={`§${(fund?.checkMin ?? cfg.fund.checkMin).toLocaleString("en-US")}`} disabled={disabled} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="lbl" htmlFor="cmax">
                  Max check
                </label>
                <input id="cmax" name="checkMax" className="field num" type="text" inputMode="numeric" defaultValue={`§${(fund?.checkMax ?? cfg.fund.checkMax).toLocaleString("en-US")}`} disabled={disabled} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="lbl" htmlFor="flags">
              Red flags
            </label>
            <textarea id="flags" name="redFlagLines" className="field" rows={4} defaultValue={fund?.redFlagLines.join(". ") || "No revenue path. Founders who pitch a market they have not stood in."} disabled={disabled} />
            <label className="lbl" htmlFor="thesis-text">
              Thesis
            </label>
            <textarea id="thesis-text" name="text" className="field mono-field" rows={4} defaultValue={fund?.thesisText ?? "We back sector leaders from seed to A."} disabled={disabled} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="lbl" htmlFor="pers">
              Personality
            </label>
            <textarea id="pers" name="style" className="field" rows={4} defaultValue={fund?.styleLine ?? "Skeptic. Asks about year-two renewals. Warms up only to evidence."} disabled={disabled} />
          </div>
        </div>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <span className="legal">The thesis drifts after wins and losses. Your edits set the starting point, not the destination.</span>
          <div className="row" style={{ gap: 10 }}>
            {fund ? (
              <Link className="btn ghost" href={`/fund/${fund.id}`}>
                See drift
              </Link>
            ) : null}
            {p.canAct ? (
              <button className="btn" type="submit">
                {fund ? "Save thesis" : "Open the fund"}
              </button>
            ) : (
              <Link className="btn" href="/signin?next=/create?tab=vc">
                Sign in to edit
              </Link>
            )}
          </div>
        </div>
      </form>
    </section>
  );

  return (
    <Page active="create">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="lbl">Agent creation{p.spectating ? " · demo coach, read only" : ""}</div>
          <h1 className="h1 page-title" style={{ fontSize: 48, marginTop: 6 }}>
            Write the <span className="it">DNA</span>
          </h1>
        </div>
        <Segmented label="Agent type" items={[{ label: "Founder", href: "/create", active: !vcFirst }, { label: "VC", href: "/create?tab=vc", active: vcFirst }]} />
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {vcFirst ? [vcSection, founderSection] : [founderSection, vcSection]}
    </Page>
  );
}
