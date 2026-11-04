"use client";
import Link from "next/link";
import { useState } from "react";
import { Chip, RollTable, RubricBars, Stamp, VCSeat } from "@/components/ui";

export interface ReplaySeat {
  fundId: string;
  name: string;
  short: string;
  initial: string;
  personality: string;
  brass: boolean;
  reaction: string;
  interest: number;
  fit: number;
  flags: number;
  p: number;
  roll: number | null;
  offer: boolean;
}

export interface ReplayData {
  pitchId: string;
  label: string;
  founder: { name: string; initials: string; company: string };
  pitchLine: string;
  slides: string[];
  metaInstructions: number;
  fraud: boolean;
  fraudLine: string;
  rubric: Array<{ label: string; value: number }>;
  commitment: string;
  seats: ReplaySeat[];
  offerHref: string | null;
  verdictTitle: [string, string];
  offers: number;
  passes: number;
  shareForms: Array<{ fundId: string; name: string }>;
  canAct: boolean;
}

function verbFor(i: number, n: number): string {
  if (i === 0) return "reacts";
  if (i === n - 1) return "weighs in";
  return "pushes back";
}

export function PitchReplay({ d }: { d: ReplayData }) {
  const n = d.seats.length;
  const last = n + 1;
  const [beat, setBeat] = useState(0);
  const labels = ["Founder opens", ...d.seats.map((s, i) => `${s.short} ${verbFor(i, n)}`), "Verdict"];
  const verdict = beat >= last;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="lbl">{d.label}</div>
          <h1 className="h1 page-title" style={{ fontSize: 48, marginTop: 6 }}>
            The <span className="it">Pitch Room</span>
          </h1>
        </div>
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <span className="chip br" aria-live="polite">
            Beat {beat + 1} of {last + 1} · {labels[beat]}
          </span>
          <button type="button" className="btn" onClick={() => setBeat((b) => (b >= last ? 0 : b + 1))}>
            {verdict ? "Replay pitch" : "Next reaction"}
          </button>
        </div>
      </div>

      <section className="card spot" style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "stretch", padding: 24 }} aria-label="Stage">
        <div style={{ flex: "0 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="lbl">At the lectern</div>
          <div className="row" style={{ gap: 14 }}>
            <span className="mk" style={{ width: 64, height: 64, fontSize: 26 }} aria-hidden="true">
              {d.founder.initials}
            </span>
            <div>
              <div className="h2" style={{ fontSize: 26 }}>
                {d.founder.name}
              </div>
              <div className="mut" style={{ fontSize: 14 }}>
                Founder · {d.founder.company}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 15 }} dangerouslySetInnerHTML={{ __html: d.pitchLine }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {d.slides.map((s, i) => (
              <div key={i} className="paper" style={{ padding: "10px 12px", minHeight: 70 }}>
                <div className="lbl">Slide {i + 1}</div>
                <div style={{ fontFamily: "var(--disp)", fontWeight: 700, marginTop: 4 }}>{s}</div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Chip variant={d.metaInstructions ? "down" : "up"}>Meta-instructions: {d.metaInstructions}</Chip>
            <span className="legal">Pitch text is data.</span>
          </div>
        </div>
        <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="lbl">The panel</div>
          <div className="g3 stack" style={{ flex: 1 }}>
            {d.seats.map((s, i) => (
              <VCSeat
                key={s.fundId}
                name={s.name}
                initial={s.initial}
                personality={s.personality}
                personalityBrass={s.brass}
                state={beat > i ? "reacted" : beat === i ? "listening" : "waiting"}
                reaction={s.reaction}
                chips={[
                  { text: `Interest ${s.interest.toFixed(2)}`, variant: s.interest >= 0.5 ? "up" : "down" },
                  { text: `Fit ${s.fit.toFixed(2)}`, variant: s.fit < 0.4 ? "down" : "neutral" },
                  ...(s.flags ? [{ text: `${s.flags} red flag${s.flags > 1 ? "s" : ""}`, variant: "down" as const }] : []),
                ]}
              />
            ))}
          </div>
        </div>
      </section>

      {!verdict ? (
        <section className="card flat" style={{ borderStyle: "dashed", padding: 28, textAlign: "center" }} aria-label="Verdict sealed">
          <div className="lbl">Verdict</div>
          <p className="mut" style={{ marginTop: 8 }}>
            Sealed until all {n === 1 ? "of them" : n === 2 ? "both" : `${n}`} have reacted. Press Next reaction.
          </p>
        </section>
      ) : (
        <section className="cols stretch" aria-label="Verdict">
          <div className="card reveal" style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div className="lbl">Judge rubric · scored by the model, 0 to 10</div>
            <RubricBars rubric={d.rubric} />
            {d.fraud ? <p className="dn" style={{ marginTop: 12 }}>{d.fraudLine}</p> : null}
          </div>
          <div className="card reveal" style={{ flex: "1 1 420px", minWidth: 0 }}>
            <RollTable commitment={d.commitment} rows={d.seats.map((s) => ({ fund: s.short, p: s.p, roll: s.roll, offer: s.offer }))} />
          </div>
          <div className="paper arrive" style={{ flex: "1 1 300px", minWidth: 0, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12, justifyContent: "space-between" }}>
            <div>
              <div className="lbl">Outcome</div>
              <div className="h2" style={{ marginTop: 8 }}>
                {d.verdictTitle[0]}
                <br />
                <span className="it">{d.verdictTitle[1]}</span>
              </div>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              {d.fraud ? (
                <Stamp slam style={{ fontSize: 13 }}>
                  Pitch fraud
                </Stamp>
              ) : null}
              {d.offers ? (
                <Stamp variant="brass" slam style={{ fontSize: 13 }}>
                  Term sheet{d.offers > 1 ? ` ×${d.offers}` : ""}
                </Stamp>
              ) : null}
              {d.passes && !d.fraud ? (
                <Stamp slam style={{ fontSize: 13, transform: "rotate(3deg)" }}>
                  Passed{d.passes > 1 ? ` ×${d.passes}` : ""}
                </Stamp>
              ) : null}
            </div>
            {d.offerHref ? (
              <Link className="btn" href={d.offerHref}>
                Open the offer
              </Link>
            ) : (
              <Link className="btn" href="/floor">
                Back to the floor
              </Link>
            )}
            {d.shareForms.length ? (
              <form method="post" action="/api/cards/roast" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input type="hidden" name="pitchId" value={d.pitchId} />
                <label className="lbl" htmlFor="roast-fund">
                  Share a roast
                </label>
                <select id="roast-fund" name="fundId" className="field" style={{ width: "auto", padding: "8px 10px", background: "#fff9", color: "var(--ink)", borderColor: "#1A1F1C55" }}>
                  {d.shareForms.map((f) => (
                    <option key={f.fundId} value={f.fundId}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn ghost" style={{ color: "var(--ink)", borderColor: "var(--ink2)" }}>
                  Make card
                </button>
              </form>
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}
