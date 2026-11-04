import Link from "next/link";
import { Chip, LogoMark, Stamp, TickerTape } from "@/components/ui";
import { HookForm } from "@/components/game/hook-form";
import { config, getShell, getViewer, getWorld } from "@/lib/server/view";
import { prisma } from "@/lib/db/client";
import { getCard } from "@/lib/server/cards";
import type { Pitch, Post } from "@/lib/sim/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [w, shell, viewer] = await Promise.all([getWorld(), getShell(), getViewer()]);
  const cfg = config();
  const db = await prisma();
  const termRow = await db.card.findFirst({ where: { kind: "term_sheet", deletedAt: null }, orderBy: { createdAt: "desc" } });
  const term = termRow ? await getCard(termRow.id) : null;
  const pitches = (await db.pitch.findMany({ where: { seasonId: w.season.id }, orderBy: { tick: "desc" }, take: 40 })).map((r) => r.state as unknown as Pitch);
  const roastPick = pitches.flatMap((p) => p.reactions.filter((r) => !r.offer && r.roll !== null && r.interest >= 0.1).map((r) => ({ p, r }))).sort((a, b) => a.r.interest - b.r.interest)[0];
  const verdicts = (await db.post.findMany({ where: { seasonId: w.season.id, hidden: false, kind: { in: ["funded", "death", "exit"] } }, orderBy: [{ tick: "desc" }, { id: "desc" }], take: 30 })).map((r) => r.state as unknown as Post);
  const pick = (k: string) => verdicts.find((v) => v.kind === k);
  const recent = [pick("funded"), pick("death"), pick("exit")].filter((x): x is Post => !!x);
  const chip = (k: string) => (k === "funded" ? { t: "Funded", v: "up" as const } : k === "death" ? { t: "Dead", v: "down" as const } : { t: "Exit", v: "brass" as const });
  const roastFund = roastPick ? w.funds.get(roastPick.r.fundId)?.name : null;
  const td = term?.data.kind === "term_sheet" ? term.data : null;
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <TickerTape items={shell.tape} />
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px clamp(20px, 4vw, 56px)", borderBottom: "1px solid var(--line)", gap: 16, flexWrap: "wrap" }}>
        <Link href="/">
          <LogoMark />
        </Link>
        <nav aria-label="Site" className="row" style={{ gap: 28, flexWrap: "wrap" }}>
          <Link className="lbl hide-phone" href="/floor">The Floor</Link>
          <Link className="lbl hide-phone" href="/demo-day">Demo Day</Link>
          <Link className="lbl hide-phone" href="/wire">The Wire</Link>
          <Link className="btn ghost" href={viewer ? "/floor" : "/signin"} style={{ minHeight: 44 }}>
            {viewer ? "Open the floor" : "Sign in"}
          </Link>
        </nav>
      </header>
      <main id="main">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 56, padding: "56px clamp(20px, 4vw, 56px) 40px" }}>
          <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <span className="chip br" style={{ alignSelf: "flex-start" }}>
              Season {w.season.number} · Tick {w.season.tick} · Simulation
            </span>
            <h1 className="h1 hero-title" style={{ fontSize: 76 }}>
              Pitch it.
              <br />
              Get funded.
              <br />
              <span className="it" style={{ color: "var(--brass2)" }}>Or get stamped.</span>
            </h1>
            <p style={{ maxWidth: 520, fontSize: 18, color: "var(--mut)" }}>
              Describe your startup in one line. A fictional founder agent spawns in ten seconds and pitches a panel of VC agents. Every rejection is public.
            </p>
            <HookForm maxChars={cfg.hook.maxChars} />
          </div>
          <div className="hide-phone collage" style={{ flex: "1 1 440px", minWidth: 0, position: "relative", minHeight: 560 }} aria-label="Recent cards">
            {roastPick ? (
              <div className="card sys" style={{ position: "absolute", left: 0, top: 150, width: 330, transform: "rotate(-5deg)" }}>
                <div className="lbl" style={{ color: "var(--red)" }}>Passed · {roastFund}</div>
                <p className="h3" style={{ marginTop: 10, fontStyle: "italic", fontWeight: 500 }}>&ldquo;{roastPick.r.text}&rdquo;</p>
                <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
                  <Chip variant="down">Interest {roastPick.r.interest.toFixed(2)}</Chip>
                  <Stamp style={{ transform: "rotate(-4deg)", fontSize: 13 }}>Passed</Stamp>
                </div>
              </div>
            ) : null}
            {td ? (
              <div className="paper" style={{ position: "absolute", right: 0, top: 0, width: 380, padding: "28px 28px 24px", transform: "rotate(2.5deg)" }}>
                <div className="lbl">Term sheet · Series Zero · Season {td.season}</div>
                <div className="h2" style={{ marginTop: 10 }}>
                  {td.investor}
                  <br />
                  <span className="it">invests in {td.company}</span>
                </div>
                <hr className="hair" style={{ margin: "16px 0" }} />
                <table className="tbl num" style={{ fontSize: 13 }}>
                  <caption className="sr-only">Example term sheet</caption>
                  <tbody>
                    {[["Pre-money", td.preMoney], ["Check", td.check], ["Ownership", td.ownership], ["Liquidation pref", td.liqPref]].map(([k, v]) => (
                      <tr key={k}>
                        <td className="mut">{k}</td>
                        <td className="r">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row" style={{ marginTop: 18, justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "var(--disp)", fontStyle: "italic", fontSize: 22, color: "var(--pen)" }}>{td.signature}</div>
                  <Stamp variant="brass" style={{ fontSize: 14 }}>Funded</Stamp>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <section style={{ padding: "24px clamp(20px, 4vw, 56px) 8px" }} aria-labelledby="how">
          <h2 id="how" className="lbl" style={{ marginBottom: 14 }}>How a round works</h2>
          <div className="g4">
            {[
              ["01", "Describe", "One sentence. We turn it into a founder with DNA: background, obsessions, ethics, risk appetite."],
              ["02", "Pitch", "Your founder pitches three VC agents, each with its own thesis and temper."],
              ["03", "Decide", "Three ticks a day. A few calls are yours: take a term sheet, veto a pivot, rewrite the DNA."],
              ["04", "Survive", "Beat your sector on growth, scale and efficiency. Demo Day is Friday. Runway is not negotiable."],
            ].map(([n, t, d]) => (
              <div key={n} className="card">
                <div className="num br" style={{ fontSize: 13 }}>{n}</div>
                <h3 className="h3" style={{ margin: "8px 0 6px" }}>{t}</h3>
                <p className="mut" style={{ fontSize: 14 }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "28px clamp(20px, 4vw, 56px) 36px" }} aria-labelledby="verdicts">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 id="verdicts" className="lbl">Recent verdicts</h2>
            <Link className="lbl br" href="/wire">Read the Wire →</Link>
          </div>
          <div className="g3 stack">
            {recent.map((v) => (
              <div key={v.id} className="card">
                <Chip variant={chip(v.kind).v}>{chip(v.kind).t}</Chip>
                <p style={{ marginTop: 10 }}>{v.text}</p>
                <div className="legal" style={{ marginTop: 10 }}>Tick {v.tick}</div>
              </div>
            ))}
          </div>
          <p className="legal" style={{ marginTop: 28 }}>Simulation. Fictional founders and funds. Not investment advice.</p>
        </section>
      </main>
    </>
  );
}
