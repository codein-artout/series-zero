# STATUS.md

## Milestones

- [x] 1. Repo scaffold
- [x] 2. Mockup rendering
- [x] 3. Design system
- [x] 4. Config + RNG + ledger
- [x] 5. Data model
- [x] 6. Founder and VC agents
- [x] 7. World and news
- [x] 8. Pitch pipeline
- [x] 9. Term sheets and negotiation
- [x] 10. Company simulation
- [x] 11. Valuation and outcome ladder
- [x] 12. VC simulation and scoring
- [x] 13. Tick engine
- [x] 14. Social layer
- [x] 15. Safety
- [x] 16. Screens, desktop
- [x] 17. Phone layouts and shareable cards
- [x] 18. Seed script
- [x] 19. Tests
- [x] 20. Visual QA
- [x] 21. Docs

## Done-means checklist (verified 2026-11-04 from a fresh `git clone`)

- [x] `pnpm install`, `pnpm seed`, `pnpm build`, `pnpm test` (260 passed), `pnpm e2e` (35 passed) with no API keys and no network beyond package install.
- [x] Runs with `MockProvider`. With `ANTHROPIC_API_KEY`: **untested**, no key was available in the build environment. The provider uses the official SDK and falls back to the mock on any error, refusal or invalid output.
- [x] Currency conservation holds on every tick of a 270-tick season (`tests/unit/engine.test.ts`), and after save/load against the DB (`tests/unit/service.test.ts`).
- [x] Same seed, identical digests in two runs (`tests/unit/engine.test.ts`).
- [x] Every route in DESIGN.md exists and passes axe (zero serious/critical) at 1440 and 390 (`tests/e2e/a11y.spec.ts`). Side-by-side comparisons with the mockups are produced by `pnpm qa` into `qa/compare/`.
- [x] `/dev/components` shows every shared component with its states.
- [x] Pitch-fraud corpus (46 attacks + benign set) passes; SSRF suite (53 cases) passes; no real posting anywhere (`LogOnlySocialProvider`, push to `PushLog`).
- [x] STATUS all [x], DECISIONS.md complete, README has the mermaid diagram.

## What is running

- Engine: ordered tick pipeline (market, decision defaults, offers, revenue/burn, deaths/zombies/policy, valuation, exits, fundraising, pivots, meetings, reputation, Demo Day, notification caps, invariant, digest, season end/rollover).
- Seed world (`pnpm seed`, fixed seed, ~5s): 66 companies by tick 240 (31 alive, 4 dead, 31 acquired, 57 funded, 4 unicorn marks), 754 posts including pitch-fraud stamps, 367 pitches, 11 Demo Days, 4 visible feuds, thesis drift in every fund, demo coach (Ines Calloway / Mulch, Greywether Partners) with open term sheets and a meeting request.
- Screens: `/`, `/floor`, `/create`, `/pitch/[id]` (+ `/pitch/latest`), `/offers/[id]`, `/company/[id]` (+ `/company/mine`), `/fund/[id]` (+ `/fund/mine`), `/wire`, `/demo-day`, `/cards`, `/cards/[id]` (+ `/image?size=post|link`), `/dev/components`, `/admin`, `/signin`.
- Coverage on `lib/rules`, `lib/sim`, `lib/ledger`: ~90% statements, ~80% branches.

## Known gaps and unresolved visual differences

- Anthropic provider path not exercised (no key). Email magic links are logged to the console only; production needs a mail transport (`DEPLOY.md`).
- Visual differences vs mockups (by design or data, not layout bugs):
  - Data differs from mockup copy (seeded world vs illustrative numbers); pixel diffs in `qa/report.md` are 4% to 11% at 1440 for most routes.
  - `/cards`: the mockup artboard has no app shell; ours keeps the shell (DESIGN.md) and shows previews at 82%.
  - Phone (390): the tab bar is `position: fixed`, so full-page screenshots show it at the viewport bottom rather than at the end of the document as in the static mockups. The Floor at 390 shows all five sections (mockup crops to three).
  - Pitch room at 390 hides the four slide thumbnails (mockup omits them too).
  - The heatmap tile spans are rank-based (largest 2x2, 2nd and 4th 2x1), so the arrangement changes as pools move.
- Outcome odds use a reduced-form forward model (see DECISIONS.md); "operating" outcomes are folded into Zombie on the five-rung ladder.
- Zombies are rare in the seed run (strict 63-tick flat window from GAME.md).
- Same-IP clustering is recorded for guest accounts only (email users have no IP captured at creation).
- Three lint warnings remain (unused-variable style); no lint errors.

## Next

- Wire a real mail transport for magic links; try the Anthropic path with a key and tune prompts.
- Optional: per-user time zones for quiet hours; richer zombie dynamics.

## Final summary

Series Zero is built end to end: a deterministic, seeded simulation (pure rules in `lib/rules`, engine in `lib/sim`, double-entry ledger with a per-tick conservation check) persisted through a repository to PGlite or Postgres, a nonce-delimited, zod-validated LLM layer that defaults to a deterministic mock, SSRF-safe URL reading, a rule-based injection detector with fines, and the full Boardroom Ledger UI matching the mockups at desktop and phone widths, with share-card images, Auth.js (guest, demo, magic link), cron and admin ticks. Everything in "Done means" was verified from a clean clone.
