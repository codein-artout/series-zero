import Link from "next/link";
import type { ReactNode } from "react";
import { Chip, ButtonLink, Mark, Stamp, cx, type ChipVariant } from "./primitives";

export function VCSeat({
  name,
  initial,
  personality,
  personalityBrass,
  state,
  reaction,
  chips = [],
}: {
  name: string;
  initial: string;
  personality: string;
  personalityBrass?: boolean;
  state: "listening" | "waiting" | "reacted";
  reaction?: string;
  chips?: Array<{ text: string; variant?: ChipVariant }>;
}) {
  return (
    <div className="card" style={{ background: "var(--s2)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <Mark text={initial} />
        <div>
          <div className="h3" style={{ fontSize: 17 }}>
            {name}
          </div>
          <Chip small variant={personalityBrass ? "brass" : "neutral"}>
            {personality}
          </Chip>
        </div>
      </div>
      <div aria-live="polite">
        {state === "reacted" && reaction ? (
          <div className="reveal">
            <p style={{ fontFamily: "var(--disp)", fontSize: 19, lineHeight: 1.25 }}>&ldquo;{reaction}&rdquo;</p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {chips.map((c, i) => (
                <span key={c.text} className="reveal-chip" style={{ animationDelay: `${i * 60}ms` }}>
                  <Chip variant={c.variant}>{c.text}</Chip>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="mut" style={{ fontStyle: "italic" }}>
            {state === "listening" ? "Listening…" : "Waiting their turn…"}
          </p>
        )}
      </div>
    </div>
  );
}

export type PostKind = "pass" | "term_sheet" | "funded" | "pivot" | "exit" | "death" | "fraud" | "demo_day" | "general";

const KIND_CHIP: Record<PostKind, { text: string; variant: ChipVariant }> = {
  pass: { text: "Passed", variant: "down" },
  term_sheet: { text: "Term sheet", variant: "brass" },
  funded: { text: "Funded", variant: "up" },
  pivot: { text: "Pivot rumor", variant: "neutral" },
  exit: { text: "Exit", variant: "brass" },
  death: { text: "Dead", variant: "down" },
  fraud: { text: "Pitch fraud", variant: "down" },
  demo_day: { text: "Demo Day", variant: "brass" },
  general: { text: "Wire", variant: "neutral" },
};

export function PostCard({
  author,
  initials,
  role,
  tick,
  text,
  kind,
  companyName,
  companyHref,
  fine,
  cosigns,
  roasts,
  highlight,
  reactions,
  report,
}: {
  author: string;
  initials: string;
  role: "VC" | "Founder" | "System";
  tick: number;
  text: ReactNode;
  kind: PostKind;
  companyName?: string;
  companyHref?: string;
  fine?: string;
  cosigns?: number;
  roasts?: number;
  highlight?: boolean;
  reactions?: ReactNode;
  report?: ReactNode;
}) {
  const system = role === "System";
  const chip = KIND_CHIP[kind];
  return (
    <article className={cx("card", system && "sys", highlight && !system && "accent")} style={{ display: "flex", gap: 14 }}>
      <Mark text={system ? "!" : initials} system={system} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <b>{author}</b>
          <Chip small variant={system ? "down" : "neutral"}>
            {role}
          </Chip>
          <span className="legal">Tick {tick}</span>
        </div>
        <p style={{ marginTop: 6 }}>{text}</p>
        <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {kind === "pass" ? (
            <Stamp style={{ fontSize: 11, padding: "2px 8px", transform: "rotate(-3deg)" }}>Passed</Stamp>
          ) : kind === "fraud" ? (
            <Stamp slam style={{ fontSize: 12, padding: "3px 10px" }}>
              Pitch fraud
            </Stamp>
          ) : (
            <Chip variant={chip.variant}>{chip.text}</Chip>
          )}
          {fine ? <Chip variant="down">{fine}</Chip> : null}
          {companyName ? (
            companyHref ? (
              <Link href={companyHref} className="chip">
                {companyName}
              </Link>
            ) : (
              <Chip>{companyName}</Chip>
            )
          ) : null}
          {system ? <span className="legal">Flagged by rule, not by a model.</span> : null}
          {reactions ??
            (cosigns != null ? (
              <>
                <span className="btn ghost sm" aria-disabled="true">
                  Cosign {cosigns}
                </span>
                {roasts != null ? (
                  <span className="btn ghost sm" aria-disabled="true">
                    Roast back {roasts}
                  </span>
                ) : null}
              </>
            ) : null)}
          {report}
        </div>
      </div>
    </article>
  );
}

export function DecisionCard({
  type,
  meta,
  children,
  urgent,
  primary,
  secondary,
  compact,
}: {
  type: string;
  meta: string;
  children: ReactNode;
  urgent?: boolean;
  primary?: { label: string; href?: string; node?: ReactNode };
  secondary?: { label: string; href?: string; node?: ReactNode };
  compact?: boolean;
}) {
  return (
    <div className={cx("card", urgent && "accent")} style={compact ? { padding: "14px 16px" } : undefined}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Chip variant={urgent ? "brass" : "neutral"}>{type}</Chip>
        <span className="legal">{meta}</span>
      </div>
      <div style={{ margin: "10px 0 14px" }}>{children}</div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {primary ? primary.node ?? <ButtonLink href={primary.href ?? "#"} variant={secondary || !urgent ? "primary" : "primary"}>{primary.label}</ButtonLink> : null}
        {secondary ? secondary.node ?? <ButtonLink href={secondary.href ?? "#"} variant="ghost">{secondary.label}</ButtonLink> : null}
      </div>
    </div>
  );
}

export interface PodiumEntry {
  rank: 1 | 2 | 3;
  name: string;
  sub: string;
  score: number;
  href?: string;
}

export function Podium({ entries }: { entries: PodiumEntry[] }) {
  const by = (r: number) => entries.find((e) => e.rank === r);
  const order = [by(2), by(1), by(3)].filter(Boolean) as PodiumEntry[];
  return (
    <section className="card spot" style={{ padding: "32px 24px 0", overflow: "hidden" }} aria-label="Podium">
      <ol style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 16, flexWrap: "wrap", listStyle: "none", margin: 0, padding: 0 }}>
        {order.map((e) => {
          const first = e.rank === 1;
          const h = first ? 180 : e.rank === 2 ? 130 : 100;
          const name = e.href ? <Link href={e.href}>{e.name}</Link> : e.name;
          return (
            <li key={e.rank} style={{ width: first ? 260 : 240, textAlign: "center" }} aria-label={`Rank ${e.rank}: ${e.name}, score ${e.score.toFixed(2)}`}>
              {first ? (
                <Stamp variant="brass" style={{ fontSize: 12, padding: "2px 10px", transform: "rotate(-3deg)" }}>
                  Season leader
                </Stamp>
              ) : null}
              <div className="h3" style={first ? { marginTop: 8, fontSize: 24 } : undefined}>
                {name}
              </div>
              <div className="legal" style={{ marginBottom: 8 }}>
                {e.sub}
              </div>
              <div
                style={
                  first
                    ? { height: h, background: "var(--brass)", color: "#16130A", paddingTop: 18 }
                    : { height: h, background: "var(--s2)", border: "1px solid var(--line2)", borderBottom: 0, paddingTop: e.rank === 2 ? 14 : 10 }
                }
              >
                <div className="h1" style={{ fontSize: first ? 76 : e.rank === 2 ? 56 : 44, color: first ? undefined : "var(--mut)" }} aria-hidden="true">
                  {e.rank}
                </div>
                <div className="num" style={first ? { fontWeight: 600 } : undefined}>
                  {e.score.toFixed(2)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ProgressStrip({ steps, done, active }: { steps: string[]; done: number; active?: boolean }) {
  return (
    <ol className="steps" aria-label="Progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((s, i) => (
        <li key={s} className={cx("step", i < done && "done", active && i === done && "active")} aria-current={active && i === done ? "step" : undefined}>
          {s}
          <span className="sr-only">{i < done ? " (done)" : active && i === done ? " (in progress)" : " (pending)"}</span>
        </li>
      ))}
    </ol>
  );
}

export function Segmented({ items, label }: { items: Array<{ label: string; href: string; active?: boolean }>; label: string }) {
  return (
    <nav className="seg" aria-label={label}>
      {items.map((i) => (
        <Link key={i.label} href={i.href} aria-current={i.active ? "page" : undefined}>
          <span className={cx("chip", i.active && "br")}>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
