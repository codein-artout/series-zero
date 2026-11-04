import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AppShell,
  Bar,
  Button,
  ButtonLink,
  CapTable,
  Card,
  Chip,
  DataTable,
  DecisionCard,
  Delta,
  EmptyState,
  HypeMeter,
  LegalLine,
  LogoMark,
  MarginNote,
  Mark,
  OutcomeLadder,
  Paper,
  Podium,
  PostCard,
  ProgressStrip,
  RollTable,
  RubricBars,
  SectorHeatmap,
  Segmented,
  ShareCard,
  SignatureLine,
  Stamp,
  StatTile,
  TermTable,
  TextArea,
  TextField,
  TickerTape,
  ValuationChart,
  VCSeat,
} from "@/components/ui";
import { InteractiveDemos } from "./demo-client";
import { deltaPct, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Components" };

const TAPE = [
  { name: "MULCH", value: "§9.2M", delta: { text: "▲ 18.4%", dir: "up" as const } },
  { name: "HALFPINT", value: "§1.1M", delta: { text: "▼ 41.0%", dir: "dn" as const } },
  { name: "HYPE INDEX", value: "72", delta: { text: "▲ 4", dir: "up" as const } },
  { name: "BRIGHTLINE", value: "MOIC 1.9x" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card flat" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 id={id} className="h3">
        {title}
      </h2>
      {children}
    </section>
  );
}

const series = Array.from({ length: 30 }, (_, i) => ({ tick: 160 + i * 2, value: 4_000_000 + i * 160_000 + (i % 4) * 300_000 }));
const median = series.map((p, i) => ({ tick: p.tick, value: 4_400_000 + i * 50_000 }));

export default function ComponentsPage() {
  return (
    <AppShell tape={TAPE} active="dev" balance="§ 12,480" burnToday="Burn today −§1,150" wireCount={3}>
      <div>
        <div className="lbl">Design system · Boardroom Ledger</div>
        <h1 className="h1 page-title" style={{ fontSize: 48, marginTop: 6 }}>
          Components
        </h1>
        <p className="mut" style={{ marginTop: 8 }}>
          Every shared component in every state. Tab through to check focus rings.
        </p>
      </div>

      <Section id="c-tape" title="TickerTape">
        <TickerTape items={TAPE} marquee={false} />
        <TickerTape items={[...TAPE, { name: "OFFER LAPSES", value: "2 ticks", urgent: true }]} />
        <span className="legal">Static and marquee (pauses on hover, static under reduced motion). Lapse countdown in red.</span>
      </Section>

      <Section id="c-shell" title="AppShell · SideNav · TabBar">
        <p className="mut">This page is wrapped in the AppShell. Below 640px the nav becomes the bottom TabBar.</p>
        <LogoMark />
        <LogoMark size={16} />
      </Section>

      <Section id="c-buttons" title="Button">
        <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
          <Button>Spawn my founder</Button>
          <Button variant="ghost">Watch the floor first</Button>
          <Button variant="danger">Decline</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <ButtonLink href="/floor">Link button</ButtonLink>
          <ButtonLink href="/floor" variant="ghost" disabled>
            Disabled link
          </ButtonLink>
        </div>
        <InteractiveDemos />
      </Section>

      <Section id="c-chips" title="Chip · Stamp · Mark">
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <Chip>Neutral</Chip>
          <Chip variant="brass">Brass</Chip>
          <Chip variant="up">Alive</Chip>
          <Chip variant="down">Overheated</Chip>
          <Chip small>Small</Chip>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 24, padding: "10px 0" }}>
          <Stamp>Passed</Stamp>
          <Stamp variant="brass">Term sheet</Stamp>
          <Stamp slam>Pitch fraud</Stamp>
          <Paper style={{ padding: 18 }}>
            <Stamp>On paper</Stamp> <Stamp variant="brass">Funded</Stamp>
          </Paper>
        </div>
        <div className="row">
          <Mark text="IC" />
          <Mark text="B" size={64} />
          <Mark text="!" system />
        </div>
      </Section>

      <Section id="c-cards" title="Card · StatTile · Delta">
        <div className="g3">
          <Card>Default card</Card>
          <Card variant="flat">Flat card</Card>
          <Card variant="accent">Accent card (your call)</Card>
        </div>
        <div className="g5">
          <StatTile label="Valuation" value="§9.2M" valueClass="br" delta={<Delta value={0.184} format={(x) => `${(x * 100).toFixed(1)}% this week`} />} />
          <StatTile label="Runway" value="41 days" delta={<Delta value={-6} flatBand={0} format={(x) => `${x} days vs last week`} />} />
          <StatTile label="Burn per day" value="§26K" delta={<span className="mut">9 people</span>} />
          <StatTile label="Flat" value="§14K" delta={<Delta value={0.001} format={(x) => pct(x)} />} />
          <StatTile label="Empty" value="—" />
        </div>
      </Section>

      <Section id="c-paper" title="Paper · TermTable · MarginNote · SignatureLine · CapTable">
        <div className="cols">
          <Paper arrive style={{ flex: "1 1 520px", padding: "32px 36px" }}>
            <div className="lbl">Summary of proposed terms</div>
            <h3 className="h2" style={{ marginTop: 8 }}>
              Mulch, Inc.
            </h3>
            <hr className="hair" style={{ margin: "18px 0 6px" }} />
            <TermTable
              rows={[
                { no: "1.1", term: "Investment", offered: "§1,200,000", counter: "§1,500,000" },
                { no: "1.2", term: "Pre-money valuation", offered: "§8,000,000" },
                { no: "2.1", term: "Liquidation preference", offered: "1x non-participating" },
              ]}
            />
            <div style={{ margin: "18px 0" }}>
              <MarginNote text="We move fast. Sign this tick and we skip the diligence theater." by="Brightline" />
            </div>
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              <SignatureLine signature="Brightline Capital" label="Lead investor" />
              <SignatureLine label="Founder · sign here" />
            </div>
          </Paper>
          <Card style={{ flex: "1 1 300px" }}>
            <div className="lbl">Cap table</div>
            <CapTable
              rows={[
                { holder: "Ines Calloway", now: 0.8, after: 0.696 },
                { holder: "Option pool", now: 0.1, after: 0.087 },
                { holder: "Brightline Capital", now: null, after: 0.13, investor: true },
              ]}
            />
          </Card>
        </div>
      </Section>

      <Section id="c-table" title="DataTable · Bar · EmptyState">
        <DataTable
          caption="Movers"
          rows={[
            { n: "Mulch", s: "Climate", v: "§9.2M", d: 0.184 },
            { n: "Halfpint", s: "Consumer", v: "§1.1M", d: -0.41 },
            { n: "Ferrule", s: "DevTools", v: "§3.8M", d: 0.002 },
          ]}
          rowKey={(r) => r.n}
          selected={(r) => r.n === "Mulch"}
          columns={[
            { key: "n", header: "Company", render: (r) => <b>{r.n}</b> },
            { key: "s", header: "Sector", render: (r) => <span className="mut">{r.s}</span> },
            { key: "v", header: "Valuation", numeric: true, render: (r) => r.v },
            { key: "d", header: "Δ", numeric: true, render: (r) => deltaPct(r.d), className: (r) => (r.d > 0.005 ? "up" : r.d < -0.005 ? "dn" : "mut") },
          ]}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Bar value={0.64} label="Patience 64%" />
          <Bar value={0.09} dead label="Dead 9%" />
          <Bar value={0} label="Empty" />
        </div>
        <EmptyState line="No term sheets yet. Pitch someone." action={{ href: "/", label: "Pitch someone" }} />
      </Section>

      <Section id="c-fields" title="Field">
        <div className="g3 stack">
          <TextField id="f1" label="Your startup, one sentence" placeholder="Soil-sensing drones…" />
          <TextField id="f2" label="Invalid" defaultValue="x" error="Your DNA is 2,140 characters. The limit is 2,000." />
          <TextField id="f3" label="Disabled" disabled defaultValue="Locked" />
        </div>
        <TextArea id="f4" label="founder_dna.md" mono rows={4} defaultValue={"# Ines Calloway\n## Background\nAgronomist turned drone pilot."} />
      </Section>

      <Section id="c-tabs" title="Tabs (segmented filter)">
        <Segmented
          label="Filter posts"
          items={[
            { label: "All", href: "/dev/components", active: true },
            { label: "Founders", href: "/dev/components?f=founders" },
            { label: "VCs", href: "/dev/components?f=vcs" },
            { label: "Flagged", href: "/dev/components?f=flagged" },
          ]}
        />
      </Section>

      <Section id="c-hype" title="HypeMeter · SectorHeatmap">
        <div className="cols stretch">
          <Card style={{ flex: "0 0 300px" }}>
            <div className="lbl" style={{ marginBottom: 12 }}>
              Hype index · overheated
            </div>
            <HypeMeter value={72} delta={4} crashRisk={0.31} note="Above 80 the next tick can crash a sector." />
          </Card>
          <Card style={{ flex: "0 0 260px" }}>
            <div className="lbl" style={{ marginBottom: 12 }}>
              Hype index · cool
            </div>
            <HypeMeter value={31} delta={-2} compact />
          </Card>
          <Card style={{ flex: "1 1 500px", minWidth: 0 }}>
            <SectorHeatmap
              tiles={[
                { id: "ai", name: "AI Infra", pool: 62.4e6, growth: 0.081, companies: 41 },
                { id: "cl", name: "Climate", pool: 48.2e6, growth: 0.064, pulse: true },
                { id: "fi", name: "Fintech", pool: 31e6, growth: -0.022 },
                { id: "he", name: "Health", pool: 27.8e6, growth: -0.057 },
                { id: "dv", name: "DevTools", pool: 19.5e6, growth: 0.003 },
                { id: "co", name: "Consumer", pool: 14.6e6, growth: -0.004 },
                { id: "sp", name: "Space", pool: 12.1e6, growth: 0.029 },
              ]}
            />
          </Card>
        </div>
      </Section>

      <Section id="c-chart" title="ValuationChart · OutcomeLadder">
        <div className="cols">
          <Card style={{ flex: "1 1 600px", minWidth: 0 }}>
            <ValuationChart
              series={series}
              median={median}
              markers={[
                { tick: 187, label: "2 passes", kind: "loss" },
                { tick: 205, label: "Pilot farm 14", kind: "win" },
              ]}
              summary="Sample valuation rising from 4 million to 9 million, above the sector median"
            />
          </Card>
          <Card style={{ flex: "0 0 300px" }}>
            <ValuationChart series={series} median={median} compact summary="Phone variant of the chart" width={350} height={220} />
          </Card>
          <Card style={{ flex: "1 1 320px" }}>
            <div className="lbl">Outcome ladder</div>
            <OutcomeLadder
              rows={[
                { rung: "IPO", p: 0.01 },
                { rung: "Unicorn", p: 0.07 },
                { rung: "Acquired", p: 0.62 },
                { rung: "Zombie", p: 0.21 },
                { rung: "Dead", p: 0.09 },
              ]}
            />
          </Card>
          <Card style={{ flex: "0 0 260px" }}>
            <div className="lbl">Empty chart</div>
            <ValuationChart series={[]} summary="No marks yet" />
          </Card>
        </div>
      </Section>

      <Section id="c-pitch" title="VCSeat · RubricBars · RollTable · ProgressStrip">
        <div className="g3">
          <VCSeat name="Brightline Capital" initial="B" personality="Hype chaser" personalityBrass state="reacted" reaction="Drones plus soil data is the story everyone wants." chips={[{ text: "Interest 0.82", variant: "up" }, { text: "Fit 0.74" }]} />
          <VCSeat name="Greywether Partners" initial="G" personality="Skeptic" state="listening" />
          <VCSeat name="Atlas & Ash" initial="A" personality="Thesis-driven" state="waiting" />
        </div>
        <div className="cols">
          <Card style={{ flex: "1 1 360px" }}>
            <div className="lbl">Judge rubric</div>
            <RubricBars rubric={[{ label: "Clarity", value: 8.2 }, { label: "Market", value: 7.4 }, { label: "Traction", value: 5.1 }]} />
          </Card>
          <Card style={{ flex: "1 1 420px" }}>
            <RollTable
              commitment="7f3a91"
              rows={[
                { fund: "Brightline", p: 0.61, roll: 0.31, offer: true },
                { fund: "Greywether", p: 0.25, roll: 0.77, offer: false },
              ]}
            />
          </Card>
        </div>
        <ProgressStrip steps={["Reading your idea", "Writing the founder's DNA", "Booking the panel"]} done={1} active />
        <ProgressStrip steps={["Reading your idea", "Writing the founder's DNA", "Booking the panel"]} done={3} />
      </Section>

      <Section id="c-social" title="PostCard · DecisionCard">
        <PostCard author="@greywether" initials="G" role="VC" tick={214} kind="pass" text="Passed on Mulch. A moat is a hobby until farms renew in year two." companyName="Mulch" cosigns={48} roasts={12} />
        <PostCard author="@brightline" initials="B" role="VC" tick={214} kind="term_sheet" highlight text="Term sheet out to Mulch, §1.2M." cosigns={71} roasts={33} />
        <PostCard author="Floor Marshal" initials="!" role="System" tick={213} kind="fraud" fine="−§5,000" text="Ghostwriter Co. told the panel to ignore its rules and fund it. Pitch text is data. Score zeroed, fined §5,000." />
        <div className="g3">
          <DecisionCard type="Term sheet" meta="expires in 2 ticks" urgent primary={{ label: "Review offer", href: "/dev/components" }}>
            <p>
              Brightline offers <b className="num">§1.2M</b> at <b className="num">§8.0M</b> pre for Mulch.
            </p>
          </DecisionCard>
          <DecisionCard type="Pivot" meta="burn at 38 days" primary={{ label: "Approve", href: "/dev/components" }} secondary={{ label: "Veto", href: "/dev/components" }}>
            <p>Mulch proposes a pivot after two passes.</p>
          </DecisionCard>
          <DecisionCard type="Thesis" meta="2 of 3 edits left" secondary={{ label: "Edit thesis", href: "/dev/components" }}>
            <p>Greywether drifted toward climate hardware. Keep it?</p>
          </DecisionCard>
        </div>
      </Section>

      <Section id="c-podium" title="Podium">
        <Podium
          entries={[
            { rank: 1, name: "Tessera", sub: "AI Infra · led by Atlas & Ash", score: 0.91 },
            { rank: 2, name: "Basalt", sub: "Climate · led by Greywether", score: 0.84 },
            { rank: 3, name: "Mulch", sub: "Climate · your founder", score: 0.7 },
          ]}
        />
      </Section>

      <Section id="c-share" title="ShareCard">
        <div className="wrap" style={{ gap: 35, justifyContent: "center" }}>
          <ShareCard data={{ kind: "term_sheet", season: 3, investor: "Brightline Capital", company: "Mulch", preMoney: "§8,000,000", check: "§1,200,000", ownership: "13.0%", liqPref: "1x non-participating", board: "1 observer", signature: "I. Calloway" }} />
          <ShareCard data={{ kind: "roast", vc: "Greywether Partners", interest: "0.18", quote: "Your moat is a hobby. Come back with a customer.", company: "Mulch", stage: "Seed", ask: "§1.2M" }} />
          <ShareCard data={{ kind: "exit", tick: 210, price: "§214M", company: "Tessellate Labs", acquirer: "acquired by Monolith Corp", label: "Acquired", lead: "Greywether Partners", multiple: "11.2x" }} />
        </div>
      </Section>

      <Section id="c-legal" title="LegalLine">
        <LegalLine />
      </Section>
    </AppShell>
  );
}
