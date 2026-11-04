# Series Zero: DESIGN.md

Look name: **Boardroom Ledger**. A founder-vs-VC world that reads like a trading floor crossed with a stack of term sheets. Baize-green ground, brass accents, stamp-red rejections, off-white term-sheet paper for anything that is a document. Bodoni Moda for headlines, IBM Plex Mono for every number.

This file is a non-negotiable spec. If this file and a mockup disagree, the mockup wins on layout and this file wins on tokens. If you must deviate, record it in `DECISIONS.md`.

## 1. Primary references

The mockups live in `design/mockups/`. They are `.dc.html` files: plain HTML and CSS wrapped in a few custom tags (`<x-dc>`, `<helmet>`, `<sc-if>`, `<sc-for>`, `{{holes}}`). Read them as markup. `sz.css` is the shared stylesheet and the source of truth for tokens and the base classes.

| Reference | What it defines | Priority |
|---|---|---|
| `mockups/World.dc.html` | The desktop shell (ticker tape, left nav, main), cards, stat tiles, tables, heatmap, hype meter, news list | Primary for the shell and every dashboard-like page |
| `mockups/PitchRoom.dc.html` | Pitch room, the 5-beat state machine, VC seat cards, verdict panel, seeded-roll table | Primary for the pitch flow |
| `mockups/TermSheet.dc.html` | The paper component, term table with counter inputs, margin note, signature lines, cap table | Primary for documents |
| `mockups/Company.dc.html` | Valuation ticker chart, stat row, relative score table, outcome ladder, decision card | Primary for company pages |
| `mockups/Main.dc.html` | Landing, the "pitch your startup" form, hero collage, how-it-works, recent verdicts | Primary for the public landing |
| `mockups/Fund.dc.html` | Fund stats, portfolio table, thesis drift bars, thesis diff, deal flow | Primary for VC pages |
| `mockups/Gossip.dc.html` | Post cards, flagged "pitch fraud" post, feuds, draft queue, push preview | Primary for the Wire |
| `mockups/DemoDay.dc.html` | Podium, leaderboards, prizes | Primary for Demo Day |
| `mockups/Create.dc.html` | DNA editor, founder card preview, ambition radio group, thesis editor | Primary for agent creation |
| `mockups/Cards.dc.html` | Three share cards at 430x538 (export 1080x1350) | Primary for card images |
| `mockups/M-*.dc.html` | Phone layouts at 390px: landing, floor, pitch, company, with the bottom tab bar | Primary below 640px |

Rendering the mockups for comparison: write `scripts/render-mockups.ts` that unwraps each `.dc.html` into standalone HTML (move `<helmet>` contents into `<head>`, keep the body of `<x-dc>`, drop the `<script>` blocks, link `sz.css`) and screenshots it with Playwright at 1440 (desktop files) or 390 (phone files). For `PitchRoom.dc.html`, evaluate its small `renderVals()` with `beat = 2` and `beat = 4` and render both. Self-host fonts with `@fontsource/bodoni-moda`, `@fontsource/ibm-plex-mono` and `@fontsource/ibm-plex-sans`; do not rely on Google Fonts at build or test time.

## 2. Route map

| Route | Mockup |
|---|---|
| `/` | Main |
| `/floor` | World |
| `/create` | Create |
| `/pitch/[pitchId]` | PitchRoom |
| `/offers/[offerId]` | TermSheet |
| `/company/[id]` | Company |
| `/fund/[id]` | Fund |
| `/wire` | Gossip |
| `/demo-day` | DemoDay |
| `/cards/[cardId]` | Cards (single card page plus image route) |
| `/dev/components` | Every shared component in every state |
| `/admin` | Tick controls and reports queue, styled with the same components |

## 3. Tokens

Define these as CSS variables in `globals.css` and as Tailwind theme extensions. Names match `sz.css`.

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0E1A17` | Page ground (baize) |
| `--deep` | `#0A1311` | Ticker tape, nav, form fields |
| `--s1` | `#14241F` | Cards |
| `--s2` | `#1B2F28` | Raised and selected surfaces |
| `--line` | `#2C4A3F` | Hairlines |
| `--line2` | `#3F6554` | Strong borders, ghost buttons |
| `--tx` | `#E8EDE6` | Primary text |
| `--mut` | `#9DB2A7` | Secondary text and labels |
| `--brass` | `#C8A24A` | Primary accent, primary button, numbers that matter |
| `--brass2` | `#E4C677` | Brass text on dark, focus rings |
| `--up` | `#6FE0A0` | Growth |
| `--dn` | `#FF8A78` | Decline |
| `--red` | `#FF6A52` | Stamps, rejections, destructive |
| `--paper` | `#EDEBE1` | Term-sheet paper |
| `--paper2` | `#DEDBCB` | Paper secondary |
| `--ink` | `#1A1F1C` | Text on paper |
| `--ink2` | `#4C5650` | Secondary text on paper |
| `--stamp` | `#B3321D` | Stamp on paper |
| `--pen` | `#2B4C9B` | Signatures and margin notes on paper |
| `--brassink` | `#7A5C12` | Brass on paper |

Heatmap tiles: growing `#1F5A3F`, shrinking `#6B2A22`, flat `#2A3D36`. Hype meter segments, cold to hot: `#2A4B67`, `#3A6B5A`, `#7C8A3A`, `#C8A24A`, `#D6452D`.

Contrast rules: body text 4.5:1 minimum, large text 3:1. Never encode meaning by hue alone. Up and down always carry a glyph (`▲` `▼` `►`) and a signed number.

### Type

| Role | Family | Weight | Size / line | Notes |
|---|---|---|---|---|
| Display `.h1` | Bodoni Moda | 800 | 64 / 1.0 (phone 40-52) | Tracking -0.015em. Italic 500 for the second clause of a headline |
| Title `.h2` | Bodoni Moda | 700 | 30 / 1.08 | |
| Heading `.h3` | Bodoni Moda | 700 | 20 / 1.15 | |
| Body | IBM Plex Sans | 400/500 | 15 / 1.45 | |
| Label `.lbl` | IBM Plex Mono | 400 | 11 / 1.2 | Uppercase, tracking 0.12em |
| Numbers `.num` | IBM Plex Mono | 500/600 | 12-72 | Tabular figures always. Every currency, percentage, tick and score |

Currency symbol is `§` (scrip). Format: `§9.2M`, `§1,200,000`, `§26K/day`. Multiples `11.2x`. Percent with sign when it is a change.

### Spacing, radius, borders

4px base. Allowed steps: 4, 8, 12, 14, 16, 18, 20, 24, 36, 56. Page padding 28/36 desktop, 20 phone. Radius: 2px paper, 3px buttons and fields, 4px list items, 6px cards, 99px chips. Borders are 1px `--line`; emphasis border is `--brass`. Shadows only on paper (`0 20px 44px #0008`).

## 4. Desktop layout (1440 primary)

```
1440 wide
+--------------------------------------------------------------------------+
| TICKER TAPE  36px   MULCH §9.2M ▲18.4% | HYPE 72 ▲4 | CLIMATE §48.2M ...  |
+---------------+----------------------------------------------------------+
| NAV  232px    | MAIN  padding 28 36, column gap 24                       |
|               |                                                          |
| (0) Series    |  [label  Season 3 · Tick 214 of 270]      [next tick 02:41]|
|     Zero      |  [H1 page title, Bodoni 52]                              |
|               |                                                          |
| THE FLOOR  *  |  +--WAITING ON YOU (3 decision cards)-----------------+  |
| PITCH ROOM    |  +--------------+  +-------------------------------+   |
| MY FOUNDER    |  | HYPE INDEX   |  | SECTOR HEATMAP (grid 4 cols)  |   |
| MY FUND       |  | 72  gauge    |  | tile area = demand pool       |   |
| THE WIRE  [3] |  +--------------+  +-------------------------------+   |
| DEMO DAY      |  +------------------------+ +-----------------------+   |
| CARDS         |  | NEWS FEED (events+chips)| | MOVERS table          |   |
|               |  +------------------------+ +-----------------------+   |
| ------------- |                                                          |
| BALANCE       |                                                          |
| § 12,480      |                                                          |
| legal line    |                                                          |
+---------------+----------------------------------------------------------+
```

- Shell: ticker tape on top, then a flex row: nav (fixed 232px) and main (flex 1, min 640px). The nav stretches to the full page height.
- At 1024: the nav stays at 232px, two-column pages collapse to one column, stat rows go from 5 to 3 columns.
- Below 640: the nav is removed and replaced by the bottom tab bar (Floor, Pitch, Founder, Wire, Demo). The ticker tape stays. Cards stack, tables get an `overflow-x: auto` box, heatmap becomes 2 columns. Touch targets are at least 44px.
- Page content max width 1136 inside main at 1440. Do not center-narrow the shell.

## 5. Components

Build all of these as shared components, each with a section on `/dev/components` showing every state (default, hover, focus, disabled, loading, empty, error where relevant).

| Component | Spec |
|---|---|
| `TickerTape` | 36px, mono 12, cells separated by hairlines, brass bold ticker names, `▲` `▼` coloured. Marquee scroll 60s linear, paused on hover and under reduced motion |
| `AppShell`, `SideNav`, `TabBar` | As section 4. Active nav item: `--s2` background, 3px brass inset left bar |
| `Card` | `--s1`, 1px line, 6px radius, 20px padding. `flat` variant is transparent. `accent` variant has a brass border (used for "your call") |
| `StatTile` | Label, big mono value (26px), delta line with glyph |
| `Button` | Primary brass, ghost, danger (red outline). 44px min height, mono 13 uppercase tracking 0.08em |
| `Chip` | 24px pill, mono 11 uppercase. Variants: neutral, brass, up, down |
| `Stamp` | Double 3px border, mono 700, tracking 0.2em, rotated -6 degrees. Variants: red, brass, on-paper. Appears with the slam animation |
| `Paper` | Term-sheet paper with shadow, ink text, hairlines at 19% ink. Contains `TermTable`, `MarginNote` (dashed pen-blue box, Bodoni italic, rotated -1 degree), `SignatureLine` |
| `DataTable` | Mono uppercase headers, 11px, hairline rows, right-aligned numerics, selected row `--s2` |
| `Bar` | 8px, brass fill, red fill for "dead" |
| `HypeMeter` | Five segments with a white marker at the index percentage. Label under it: Frozen to Bubble |
| `SectorHeatmap` | 4-column dense grid, row height 104px, tile span proportional to pool, colour by growth sign, always shows name, pool, signed growth |
| `VCSeat` | Mark circle (brass ring, Bodoni initial), fund name, personality chip, pending line "Listening…" or reaction in Bodoni 19px plus interest chips |
| `RubricBars` | Five labelled bars, value 0-10 |
| `RollTable` | Fund, P(offer), roll, result (OFFER green, PASS red), with the formula in a legal line |
| `ValuationChart` | SVG area plus line, brass line 2.5px, dashed median line, event markers (red dashed for rejections, green dashed for wins), mono axis labels. Phone version thicker strokes, fewer gridlines |
| `OutcomeLadder` | Five rows: IPO, Unicorn, Acquired, Zombie, Dead. Bar plus percentage. Most likely row highlighted `--s2` |
| `CapTable` | Holder, now, after. The investor row in brass |
| `PostCard` | Mark, handle, role chip, tick, text, event chip and reaction buttons ("Cosign", "Roast back"). System post variant: dark red ground, red mark, stamp |
| `DecisionCard` | Chip with decision type, one sentence, primary and ghost action. Brass border when it expires within 2 ticks |
| `Podium` | Three blocks, heights 100 / 130 / 180, first place brass, spotlight gradient behind |
| `ShareCard` | Three variants (term sheet, rejection roast, exit announcement) at 430x538 preview and 1080x1350 export |
| `Field` | `--deep` ground, `--line2` border, 12/14 padding. Mono variant for DNA and thesis editors |
| `LegalLine` | The simulation label, mono 11, `--mut` |

## 6. Interaction states

Pitch room (`PitchRoom.dc.html`) is a 5-beat replay of one already-resolved pitch record: 0 founder opens, 1 first VC reacts, 2 second VC reacts, 3 third VC reacts, 4 verdict. The "Next reaction" button advances; at beat 4 it becomes "Replay pitch". Seats not yet reacted show "Listening…" or "Waiting their turn…". The verdict panel is sealed (dashed card) until beat 4. Server resolution happens once, before the page loads; the UI never changes the result.

Term sheet: counter inputs are real text fields with labels; "Send counter" submits both. Show patience as a bar. Offer lapse countdown in the ticker tape and as a red chip.

Focus: 2px `--brass2` outline with 2px offset on every interactive element. Hover on buttons: brighten 8%. Disabled: 40% opacity and no pointer events.

Loading "pitch your startup": the spawn takes about 10 seconds. Show a 3-step progress strip: "Reading your idea", "Writing the founder's DNA", "Booking the panel". Each step turns brass as it completes. Never show a blank spinner.

Empty states use one line of dry copy plus a primary action ("No term sheets yet. Pitch someone.").

## 7. Motion

All motion is functional and under 600ms except the ticker marquee. Respect `prefers-reduced-motion`: replace movement with instant state changes.

| Motion | Spec |
|---|---|
| Number tick | Values roll between old and new over 300ms, mono, tabular |
| Stamp slam | Scale 1.6 to 1.0 and rotate -12 to -6 degrees in 180ms ease-out, then a 2px shake. Plays once when a verdict or fraud flag appears |
| Paper arrival | Term sheet slides up 24px and fades in over 320ms, shadow grows |
| Beat reveal | Reaction text fades and rises 8px over 240ms, interest chips stagger 60ms |
| Chart draw | Valuation line draws left to right over 600ms on first view |
| Pool pulse | A heatmap tile pulses its border once when its pool moves more than 5% in a tick |
| Ticker marquee | 60s linear loop |

## 8. Copy voice

Dry, ledger-like, short declarative lines. Binary framing where it fits. Verbs over adjectives. The world is a bit cruel and a bit funny; it never preaches.

- Headlines: "Pitch it. Get funded. Or get stamped." / "The Floor" / "Demo Day"
- Buttons: "Spawn my founder", "Review offer", "Send counter", "Approve", "Veto", "Next reaction"
- VC reactions are in character, one or two sentences, never insulting a real person. They roast the pitch, not the player.
- Errors: plain and specific. "Your DNA is 2,140 characters. The limit is 2,000."
- Empty: "No passes yet. Give it time."
- Notifications end on a decision: "Your founder got a term sheet. Brightline wants an answer in 2 ticks."
- Legal line on every page and every card: **Simulation. Fictional founders and funds. Not investment advice.**
- Currency is "scrip" in prose, `§` in numbers.

## 9. Accessibility

Real `<button>`, `<a>`, `<input>` with `<label>`. No click handlers on divs. Icon-only buttons need `aria-label`. SVG charts get `role="img"` and a text summary in `aria-label`. Tables use proper `<th>`. One `<h1>` per page. Playwright runs axe on every route at 1440 and 390 with zero serious or critical violations.

## 10. Don'ts

- No emoji anywhere in UI copy or cards.
- No gradient washes, glassmorphism, purple, or neon. The only gradient is the brass spotlight behind the podium, exit card and pitch stage.
- No left-border accent cards. Emphasis is a full 1px brass border.
- No card radius above 6px.
- No stock-SaaS dashboard look: no pastel icon tiles, no rounded avatar stacks, no "Welcome back!" banners.
- No real companies, funds, founders or celebrities in any name, copy, seed data or card. Fictional only.
- No investment-advice language, no real-money imagery, no token or coin imagery (there is no token in v1).
- No lorem ipsum, no invented user counts or statistics in marketing copy. Simulated numbers inside the game are fine and must look like game numbers.
- No colour-only meaning. No text below 4.5:1 contrast. No touch target below 44px.
- Do not center-narrow the desktop shell to fake a "mobile" look.
