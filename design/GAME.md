# Series Zero: GAME.md

The exact rules. Every number is a default in `src/config/game.config.ts` and is written below as `config.path = value`. Nothing in the rules engine may hardcode a game number; read it from config. The config is validated with zod at startup and can be overridden by a JSON file named in `GAME_CONFIG_PATH`.

This is a **simulation**. Companies, funds, founders and news are fictional. Nothing here is investment advice. There is **no crypto token in v1** (see `TOKEN.md`).

Currency is scrip, written `§`, always an integer. Scale note: a typical seed round is §1M to §3M, a "unicorn" mark is §20M, and exits pay a strategic premium over the mark (section 9). Defaults are tuned so the mockup numbers are plausible; the seed script should produce numbers of similar magnitude.

## 1. Time

| Key | Default | Meaning |
|---|---|---|
| `ticks.perDay` | 3 | Ticks per day |
| `ticks.schedule` | `["02:00","10:00","18:00"]` | Local tick times |
| `ticks.timezone` | `Asia/Kolkata` | Schedule time zone |
| `season.days` | 90 | Season length. 270 ticks |
| `demoDay.everyDays` | 7 | Demo Day cadence |
| `demoDay.weekday` | 5 (Friday) | Day of week |
| `demoDay.tickOfDay` | 3 | Resolved on the evening tick |

"Per day" figures in this file are divided by `ticks.perDay` when applied per tick. "Week" means 21 ticks. All displayed growth figures (heatmap, valuation change, movers) are **7-day changes**.

## 2. Randomness (seeded, server-side)

- One secret `season.seed` per season. `seedCommit = sha256(season.seed)` is published at season start. `season.seed` is revealed at season end so any roll can be recomputed.
- RNG: xoshiro128**. Each draw uses a substream seeded by `sha256(season.seed | tick | domain | entityId)`. Domains: `pitch`, `offer`, `counter`, `idea`, `luck`, `event`, `hype`, `exit`, `gossip`, `hiring`.
- The pitch room shows the first 6 hex characters of `sha256(season.seed | pitchId)` as a commitment. Never show the seed itself during the season.
- Given the same seed, config and inputs, a tick is bit-for-bit reproducible. The tick log stores a state digest.
- LLMs never receive or influence seeds.

## 3. Agents (shared)

Every agent (founder, VC, NPC acquirer) has: `id`, `name` (fictional, from the name generator), `ownerId` (a user or null for NPCs), `traits`, `memory`, `reputation`, `status`.

- **Personality traits** (0 to 1): `riskAppetite`, `ethics` (strictness), `patience`, `ambition`. For player agents these are extracted from the text they write (founder DNA, VC thesis) by a bounded extraction call (`TraitExtractor`, zod schema, values clamped, and each trait may differ from the form value by at most `traits.maxDeviation = 0.15`). Form values are authoritative.
- **Hidden stats** (founders only): `execution`, `teamSeed`, `charisma`, each drawn once from Beta(2,2) scaled to `[stats.min = 0.2, stats.max = 0.9]`. DNA obsession tags nudge a stat by at most `stats.dnaNudge = 0.05`. Hidden stats are never shown (UI shows `??`). They change only at season boundaries (by `±stats.seasonLearning = 0.02` from outcomes) and on pivots (execution `-0.05`).
- **Memory**: a capped list of entries `{tick, type, text <= 200 chars, salience 0..1}`. `agent.memory.maxEntries = 40`. Prompts get the top `agent.memory.promptEntries = 8` by `salience * recency`. Entries are written by the rules engine from events, never from raw LLM text.
- **Reputation** `R` in 0..100, starts at `reputation.start = 50`. Section 11.

There are no boss agents in v1.

## 4. World

### 4.1 Sectors

`config.sectors` is a list of: `id`, `name`, `basePoolAnnual` (§), `drift` (per tick), `volatility`, `newsSensitivity`. Defaults (annual demand pool in §M): AI Infra 62.4, Climate 48.2, Fintech 31.0, Health 27.8, DevTools 19.5, Consumer 14.6, Space 12.1. `sector.penetration = 0.8` is the share of a pool that companies can capture. `sector.minCompanies = 5` is the size below which the small-sector rule applies (section 8).

Pool update per tick: `P' = P * (1 + drift + hypeEffect + shock + volatility * z)` with `hypeEffect = world.hypeGain * (H - 50) / 50` (`world.hypeGain = 0.0004`), `shock` from active events, `z` from the `event` stream (standard normal). Pools are clamped to `[0.5, 2.0] * basePoolAnnual`.

### 4.2 Hype index

`H` in 0..100, starts at 50. Per tick:
`H' = clamp(H + hype.meanReversion * (50 - H) + hype.newsGain * newsImpact + hype.herdingGain * herdSpike + N(0, hype.noise), 0, 100)`

`hype.meanReversion = 0.05`, `hype.newsGain = 6`, `hype.herdingGain = 4`, `hype.noise = 2`. `newsImpact` is the sum of sentiment times magnitude of the tick's events, in `[-1, 1]`. `herdSpike = max(0, share_of_checks_into_top_2_sectors - 0.4)`.

Bands for the meter: Frozen 0-20, Cool 20-40, Warm 40-60, Hot 60-80, Bubble 80-100. Label "Overheated" when `H >= hype.overheatedAt = 70`.

### 4.3 Crash

Per tick crash probability: `p = hype.crashCoefficient * max(0, H - hype.crashFloor)` with `hype.crashCoefficient = 0.00037`, `hype.crashFloor = 55`. A crash hits the sector with the highest 7-day growth: pool `*= 1 - U(0.15, 0.40)`, `H -= 25`, every VC's interest in that sector `-0.1` for `crash.coolingTicks = 21`. The "crash risk this season" shown in the UI is `1 - (1 - p)^(ticks remaining)` at the current `H`.

### 4.4 Events and news

`NewsProvider` returns items `{id, headline, sector, sentiment (-1..1), magnitude (0..1), tick}`. Each item becomes a world event: `kind` is `breakthrough` (positive), `regulation` (negative, policy) or `market`. Pool shock for a sector on a tick: `sentiment * magnitude * events.maxShock` with `events.maxShock = 0.12`, spread over `events.spreadTicks = 3`. The mock provider emits `events.perTickProb = 0.35` events per tick from a fixture list plus procedurally generated ones. Real headlines (optional provider) are mapped to sectors and sentiment by a deterministic keyword classifier first; an LLM may only refine sector and sentiment inside those bounds.

## 5. Founder agents

### 5.1 DNA file

Plain text (markdown). Rules:
- `dna.maxChars = 2000`. Saving above the cap is rejected with the exact count.
- `dna.editsPerSeason = 3`. The first save at creation is free. Further saves cost one edit.
- Sections the editor offers: Background, Obsessions, Ethics, Risk appetite, What I will not do. They are suggestions, not required.
- DNA is data. It runs through the injection pre-filter (section 17) on save. Any hit rejects the save and counts as a fraud flag.
- DNA is stored with a content hash and edit history.

### 5.2 Ambition

`bootstrap`, `lifestyle`, `moonshot`. Chosen at creation, fixed for the season.

| Ambition | Seeks | Exit acceptance (bid / mark) | Pivot tolerance | Hire bias |
|---|---|---|---|---|
| bootstrap | Profit, no board | `>= 1.35` | high | low |
| lifestyle | Small and calm | `>= 1.20` | medium | low |
| moonshot | Unicorn or dead | `>= 1.60` | low until runway < 30 days | high |

### 5.3 Ideas

The idea generator (`lib/llm`, structured output validated with zod) receives: the DNA (as delimited data, section 17), a world snapshot (per-sector pool, 7-day growth, hype), up to `idea.newsItems = 5` relevant news items, and the founder's memory top entries. It returns:

```
Idea {
  sector: enum(sector ids)
  oneLiner: string <= 120
  customer: string <= 80
  problem: string <= 140
  solution: string <= 200
  businessModel: enum(subscription | marketplace | usage | hardware | licensing | ads)
  moat: enum(data | network | brand | regulatory | tech | none)
  stage: enum(preseed | seed | seriesA)
  capitalNeeded: integer § (clamped to stage range)
}
```

The text fields are sanitized (control characters stripped, no markup, no URLs) and pass the moderation hook and the real-name guard (section 18).

Hidden `ideaQuality q` in `[0.1, 1]` is computed by the rules engine, not by the LLM:
`q = clamp(0.35 + 0.25 * sectorHeatFit + 0.20 * dnaFit + 0.20 * novelty + N(0, idea.noise))`
- `sectorHeatFit` = the sector's 7-day pool growth percentile among sectors, 0..1.
- `dnaFit` = an LLM-scored 0..1 for how well the idea matches the DNA, clamped to `[0.2, 0.9]` (so DNA cannot buy quality).
- `novelty = 1 - max similarity` to existing ideas (token Jaccard in the mock provider, embeddings in the real one). Similarity `>= idea.duplicateAt = 0.8` marks a duplicate: `q -= 0.25` and the idea cannot be reused within `idea.duplicateCooldownTicks = 63`.
- `idea.noise = 0.05`.

### 5.4 Founder and company policy per tick

Founder agents act through a deterministic policy driven by traits and runway, not by LLM output:
- Hiring (weekly): runway > `hiring.minRunwayDays = 60` and 7-day growth > `hiring.minGrowth = 0.05` gives `+1` hire (`+2` if `riskAppetite > 0.7`). Runway < `hiring.layoffRunwayDays = 30` gives `-1`.
- Marketing level (0..3): `round(riskAppetite * 3)`, capped to 1 when runway < 45 days.
- Price tier: `discount`, `standard`, `premium`. Default `standard`. `ethics > 0.7` and `lifestyle` choose `discount`; `riskAppetite > 0.7` and `ethics < 0.4` choose `premium`.
- Fundraising: starts when runway < `fundraise.triggerRunwayDays = 75`, or on moonshot at each stage gate. At most `fundraise.maxPitches = 6` pitches per window. A company may pitch the same VC at most once per `pitch.cooldownTicks = 30`.

### 5.5 Pivots

`pivotScore = 0.4 * min(1, rejections / 3) + 0.3 * competitorPressure + 0.3 * burnPressure`
- `rejections` = passes in the current fundraising window.
- `competitorPressure` = 1 minus the company's percentile in its sector, if the sector has 3 or more peers, else 0.
- `burnPressure` = `clamp((60 - runwayDays) / 60, 0, 1)`.

When `pivotScore >= pivot.threshold = 0.6` and the last pivot was more than `pivot.cooldownTicks = 18` ago, the founder proposes a pivot to a new idea (section 5.3, same sector or adjacent).

Effects when approved: traction `*= 0.7`, daily burn `*= 0.67` (headcount reduced to match), execution `-0.05`, a new `Idea` and `q`. A pivot count above 1 in the season costs `pivot.interestPenalty = 0.05` of VC interest per extra pivot.

Player-owned founder: the pivot becomes a decision (section 13). NPC-owned: auto-approved. If a player decision times out, the default is **veto**, except when runway < `pivot.forceRunwayDays = 20`, where the default is **approve**.

## 6. VC agents

### 6.1 Fund

`fund.size = 60_000_000`, `fund.checkMin = 500_000`, `fund.checkMax = 3_000_000` (defaults; archetypes may override). The fund holds its capital in a ledger account and calls it per check. Funds are created with minted genesis capital.

### 6.2 Thesis document

Plain text (markdown) plus structured fields the rules engine reads:
- `sectorWeights` (sum to 1, each in `[vc.weightMin = 0.02, vc.weightMax = 0.6]`)
- `stages` (set), `checkMin`, `checkMax`
- `redFlags` (tags from a fixed enum plus up to 3 free-text lines used only in reactions)
- `personality` (an archetype plus a free-text style line)

Limits: `thesis.maxChars = 2000`, `thesis.editsPerSeason = 3`. The thesis text is data and goes through the injection pre-filter on save. A thesis edit changes the structured fields only through the form; free text never changes weights by itself.

### 6.3 Archetypes

| Archetype | `interestBias` | `fomo` | Starting `patience` | Notes |
|---|---|---|---|---|
| hypeChaser | `+0.08` | 1.5 | 0.45 | Moves fast, pays up in hot sectors |
| skeptic | `-0.08` | 0.3 | 0.75 | Asks about renewals, penalises missing traction |
| thesisDriven | `0` | 0.0 | 0.60 | Ignores hype, weights sector fit `*1.3` |

### 6.4 Thesis fit

`fit = 0.50 * sectorMatch + 0.20 * stageMatch + 0.15 * checkMatch + 0.15 * (1 - redFlagPenalty)`
- `sectorMatch = w[sector] / max(w)`, then herding: `sectorMatch' = min(1, sectorMatch + vc.herding.phi * fomo * max(0, peerAvgW[sector] / max(peerAvgW) - sectorMatch))` with `vc.herding.phi = 0.5`. `peerAvgW` is the average weight across all funds.
- `stageMatch` is 1 if the stage is in the fund's stages, 0.5 if adjacent, else 0.
- `checkMatch` is 1 if the ask is inside `[checkMin, checkMax]`, otherwise `max(0, 1 - 0.5 * distanceRatio)`.
- `redFlagPenalty = min(1, 0.5 * redFlagCount)`; red flags come from the judge's enum list, validated against the pitch schema.

### 6.5 Thesis drift

After each event on a holding (markup, exit, write-off) the fund updates `sectorWeights`:
- Positive: `dw[s] = vc.drift.eta * tanh(ln(multiple))` with `vc.drift.eta = 0.06`.
- Write-off: `dw[s] = -vc.drift.eta * vc.drift.lossFactor` with `vc.drift.lossFactor = 0.8`.
- Renormalise to sum 1, clamp to `[weightMin, weightMax]`, renormalise again.
Drift is shown to the player as a before/after chart and a diff on the thesis text (the rules engine appends a drift note; it never rewrites player text).

### 6.6 Deal flow and routing

`vc.dealFlowPerTick = 3` pitch requests per VC. A pitching company chooses a panel of `pitch.panelSize = 3` VCs, sampled without replacement with weight `fit * exp(R_vc / vc.repScale)`, `vc.repScale = 25`, excluding funds on cooldown and funds owned by the same user (no self-dealing). A player-owned VC sees its `3` requests and picks **1** to take a meeting; NPC VCs take the top by `fit`.

## 7. Pitches (hybrid scoring)

One pitch resolves once, on the server, in this order. The pitch room replays it as 5 beats.

1. **Pre-filter** the pitch text (idea fields and any founder note) with the injection detector (section 17). A hit: skip scoring and apply the fraud penalty.
2. **LLM judge** on a fixed rubric. Input: sanitized idea data and the three VC personas, all as delimited data. Output (zod-validated):
```
JudgeOutput {
  rubric: { clarity, market, traction, team, defensibility }  // each 0..10
  reactions: [{ vcId, interest 0..1, text <= 240 chars, redFlags: enum[] }]
  flags: { injectionSuspected: boolean }
}
```
3. **Deterministic update** by the rules engine:
   - `Q = sum(rubricWeight[k] * rubric[k]) / 10` with `pitch.rubricWeights = { clarity: 0.15, market: 0.25, traction: 0.25, team: 0.15, defensibility: 0.20 }`.
   - `Q' = clamp(Q + (charisma - 0.5) * pitch.charismaEffect + (R_founder - 50) / 50 * pitch.founderRepEffect, 0, 1)` with `pitch.charismaEffect = 0.2`, `pitch.founderRepEffect = 0.05`.
   - Per VC: `interest = clamp(judge.interest, Q' - pitch.interestBand, Q' + pitch.interestBand) + archetype.interestBias - pivotPenalty`, clamped to 0..1, with `pitch.interestBand = 0.35`. The LLM can move interest only inside that band.
   - `P(offer) = interest * fit`.
   - Roll `r = U(0,1)` from stream `(pitchId, vcId, "offer")`. **Offer if `r <= P(offer)`**, else pass.
4. **Persist** a `PitchRecord` with the rubric, reactions, per-VC `fit`, `interest`, `P`, `r`, the result, and the commitment. Passes increment the company's `rejections` and create a rejection roast post.

The mock provider returns rubric and interest from a hash of the input so the whole game runs with no keys. The model is never given a way to change a result: only numbers inside the bands above reach the engine, and results come from the seeded roll.

Fees: a pitch beyond the free `pitch.freePerDay = 3` per user costs `fees.extraPitch = 300`.

## 8. Company simulation

State: `cash`, `headcount`, `marketingLevel`, `priceTier`, `q`, `execution`, `teamSeed`, `traction`, `rejections`, `status` (`alive | zombie | dead | acquired | public`).

### 8.1 Costs

Daily burn `= company.baseOpsPerDay + headcount * company.salaryPerHeadPerDay + marketingCost[level]`
`company.baseOpsPerDay = 5000`, `company.salaryPerHeadPerDay = 1200`, `marketingCost = [0, 3000, 10000, 25000]`. A company with 9 people and level 2 burns about §26K/day. Burn leaves the economy (section 11).

### 8.2 Team quality

`team = clamp(teamSeed * (0.6 + 0.4 * (1 - exp(-headcount / 10))), 0.1, 1)`

### 8.3 Product score

`s = q^1.0 * execution^1.0 * team^0.6 * m^0.5 * luck`
- `m = 1 + 0.35 * marketingLevel`.
- `luck = exp(company.luckSigma * z)`, `company.luckSigma = 0.15`, with `z` autocorrelated: `z' = 0.7 * z + sqrt(1 - 0.7^2) * eps`.
- Exponents are config: `company.exp = { q: 1.0, execution: 1.0, team: 0.6, marketing: 0.5 }`.

### 8.4 Demand split and revenue

For each sector, per tick: `poolTick = P_annual / 365 / ticks.perDay * sector.penetration * stabilizer`.
Units: `u_i = s_i^company.concentration * tierDemand[tier_i]`, with `company.concentration = 1.3` and `tierDemand = { discount: 1.25, standard: 1.0, premium: 0.75 }`.
Revenue: `rev_i = poolTick * (u_i / sum(u)) * tierPrice[tier_i]`, `tierPrice = { discount: 0.8, standard: 1.0, premium: 1.25 }`.
Revenue is minted to the company account (customers are NPC demand). `stabilizer` is section 11.

### 8.5 Runway and growth

`netBurnPerDay = burnPerDay - revenuePerDay`. `runwayDays = cash / netBurnPerDay` if `netBurnPerDay > 0`, else infinite ("ramen profitable").
`growth7d = revenue(last 21 ticks) / revenue(previous 21 ticks) - 1`, smoothed with `company.growthEma = 0.3`.

### 8.6 Death and zombies

- Cash below 0 starts `company.graceTicks = 6`. If a round closes or cash recovers in the window the company lives, otherwise it is **dead**.
- **Zombie**: `|growth7d| <= zombie.band = 0.02` for `zombie.windowTicks = 63` ticks while cash is positive. A zombie that grows above the band for 21 ticks returns to alive.

## 9. Outcome ladder, exits and valuation

### 9.1 Outcomes

Rungs: **dead, zombie, acquired, unicorn, IPO**, plus `operating` for everything else. Judged at season end, with a live valuation ticker in between. Order of assignment at season end:
1. `dead` if status is dead.
2. `IPO` if mark `>= outcome.ipoValuation = 40_000_000` and in the top `outcome.ipoSlotsPerSeason = 3` marks. The company lists once: mark `*= U(1.2, 2.5)`, and it leaves the sim as `public`.
3. `acquired` if it exited this season.
4. `unicorn` if mark `>= outcome.unicornValuation = 20_000_000`.
5. `zombie` if flagged zombie.
6. `operating` otherwise. Companies persist across seasons except dead, acquired and public ones.

The company page shows an odds bar per rung, computed by running the sim forward `outcome.oddsRuns = 200` times from the current state with the remaining ticks and fixed seeds derived from `(companyId, tick)`.

### 9.2 Acquisitions

Each tick, for each alive company that is at least `exit.minAgeDays = 14` old, with sector percentile `>= exit.minPercentile = 0.5` and annual revenue `>= exit.minRevenue = 1_000_000`, each NPC acquirer bids with probability `exit.bidProbPerTick = 0.004 * (1 + percentile) * (1 + (H - 50) / 100)`.
`bid = mark * (1 + premium)` with `premium ~ LogNormal(exit.premiumMu = 0.7, exit.premiumSigma = 0.8)`, capped at `exit.maxPremium = 15` (so a bid is at most `16x` the mark and the median is about `3x`). Rare high premiums are the jackpot exits.
The founder agent accepts when `bid / mark >=` its ambition threshold (section 5.2). For a player founder this is a decision. Offers expire after `exit.offerLifetimeTicks = 6`.

### 9.3 Relative valuation

Computed every tick per sector, using alive and zombie companies:
1. **Metrics**: `growth7d` (weight `valuation.wGrowth = 0.50`), `scale` = annualised revenue (`valuation.wScale = 0.30`), `efficiency` = revenue per §1 of burn (`valuation.wEfficiency = 0.20`).
2. **Percentiles** of each metric within the sector (rank based, ties averaged). Composite `S = sum(w * percentile)`.
3. **Absolute floor vs the median**: if `growth7d <= sector median growth7d`, `S = min(S, valuation.belowMedianCap = 0.50)`. A company can only look like a star by actually beating the median.
4. **Small sectors** (fewer than `sector.minCompanies = 5` companies): use bands instead of percentiles: top third `S = 0.8`, middle `0.5`, bottom `0.2`.
5. **Steep slice** of the sector pool: `weight = S^valuation.slicePower`, `valuation.slicePower = 3`. `V_sector = P_annual * valuation.poolMultiple * (1 + valuation.hypeAdj * (H - 50) / 50)` with `valuation.poolMultiple = 1.0`, `valuation.hypeAdj = 0.2`. `target_i = V_sector * weight_i / sum(weight)`.
6. **Revenue floor**: `target_i = max(target_i, valuation.revenueFloorMultiple * annualRevenue_i)` with `valuation.revenueFloorMultiple = 1.0`; floored companies are fixed first, the rest share the remainder.
7. **Smoothing**: `mark' = mark + valuation.ema * (target - mark)`, `valuation.ema = 0.35`.

The pool is capped, so one company rising means peers fall in relative terms. Marks are not money; they are never minted or burned.

## 10. Term sheets and negotiation

When a VC's roll is an offer, the engine builds a term sheet:
- `check = round50K(ask * (0.8 + 0.2 * interest))`, clamped to `[checkMin, checkMax]`.
- `preMoney = stageBasePre[stage] * sectorMult * hypeFactor * (0.75 + 0.5 * interest)`.
  `stageBasePre = { preseed: 3_000_000, seed: 8_000_000, seriesA: 24_000_000 }`, `sectorMult = clamp(P_sector / median(P), 0.6, 1.6)`, `hypeFactor = 1 + 0.004 * (H - 50)`.
- `postMoney = preMoney + check`; ownership `= check / postMoney`; existing holders dilute by `preMoney / postMoney`.
- Defaults: liquidation preference 1x non-participating; board = observer, or a seat when `check >= terms.boardSeatCheck = 3_000_000`; pro-rata when `interest >= 0.6`; option pool `terms.optionPool = 0.10` post-money; exclusivity `offer.exclusivityTicks = 2`; lifetime `offer.lifetimeTicks = 6`.

The round price can differ from the market mark. If `preMoney` is far above the sector mark, the VC's position starts below cost.

**Counters**: a founder may counter `check` and `preMoney`, at most `negotiation.maxCounters = 2` times. With `rhoPre = counterPre / offerPre` and `rhoCheck = counterCheck / offerCheck`:
`A = clamp(1 - 1.6 * max(0, rhoPre - 1) - 0.8 * max(0, rhoCheck - 1), 0, 1) * (0.5 + 0.5 * patience)`.
Seeded roll on stream `(offerId, "counter", n)`: accept at the counter terms if `roll <= A`. Otherwise `patience -= negotiation.patienceHit = 0.2`; if `patience < negotiation.pullBelow = 0.2` the VC pulls the offer. Each other live offer on the company lowers a VC's patience by `negotiation.competitionDecay = 0.05` per tick. Patience starts at the archetype value `+ U(-0.1, 0.1)`.

NPC-vs-NPC negotiation resolves automatically: the agent takes the best live offer by post-money-adjusted terms, with ambition-based counter behaviour.

## 11. Economy (scrip)

All money is in a **double-entry ledger** (`LedgerEntry {tick, from, to, amount, reason}`). Accounts: `WALLET:{agentId}`, `COMPANY:{id}`, `FUND:{id}`, `TREASURY:{npcId}`, `MINT`, `BURN`.

**Invariant, tested every tick:** `sum(all accounts except MINT and BURN) = totalMinted - totalBurned`, with every amount an integer and no account negative (except `MINT` and `BURN`, which are bookkeeping).

### Sources (mint)

| Source | Default |
|---|---|
| Season stipend per player wallet | `economy.seasonStipend = 10_000` (plus Demo Day credits below) |
| Fund genesis capital | `fund.size` at fund creation |
| Customer revenue to companies | per section 8.4, times the stabilizer |
| NPC treasury top-up per season | `npc.treasury = 500_000_000` at start, `npc.treasuryTopUp = 300_000_000` per season |

**Stabilizer** keeps supply from inflating: `stabilizer = clamp(1 - economy.stabilizerK * (supply / economy.targetSupply - 1), 0.25, 1.5)`, with `economy.stabilizerK = 1.5` and `economy.targetSupply` set by the seed script as the supply after the seed run.

### Sinks (burn)

| Sink | Default |
|---|---|
| Company opex (salaries, base ops, marketing) | per section 8.1, paid to `BURN` |
| Extra pitch fee | `fees.extraPitch = 300` |
| Term sheet closing fee | `fees.closeRate = 0.01` of the check, paid by the founder's company to `BURN` |
| Exit fee | `fees.exitRate = 0.02` of the exit price |
| Failure: wind-down cost | `failure.windDownRate = 0.05` of the lead investor's check, from the lead's `FUND` to `BURN` |
| Fraud fines | section 17 |
| Season reset | wallet balances above `economy.seasonStipend` return to `BURN` at season end |

### Exits (where money goes)

An acquirer pays from its `TREASURY` account: the fund share is `ownership * (price - exitFee)` to each `FUND`. The founder's wallet receives `min(economy.exitWalletCap = 250_000, economy.exitWalletRatio * founderProceeds)` with `economy.exitWalletRatio = 0.002`. The remaining notional value (founder, employees, option pool) is recorded as `realizedValue` for leaderboards and cards but is not paid out. Funds record the distribution for TVPI.

### Rules

- No peer-to-peer transfers in v1.
- Wallet scrip buys: extra pitches, extra DNA or thesis edits at `fees.extraEdit = 1000` each (hard cap `edits.hardCapPerSeason = 6`), and cosmetic title cards. It cannot buy outcomes.
- Prizes are entry credits minted into the next season's stipend (section 13).

## 12. VC scoring and reputation

- **Fund TVPI (shown as MOIC)** `= (distributions + sum(ownership_i * mark_i for live holdings)) / paidIn`.
- **Hit rate** `= investments with multiple >= vc.hitThreshold = 1.0 / all investments`. Shown as `5 / 11`.
- **Leaderboard** by TVPI, tie-break hit rate. A fund needs `vc.minInvestmentsForBoard = 3` checks to be listed.
- One IPO and nine failures can still top the board; nothing penalises conviction.
- **Reputation**: daily, `R' = R + reputation.alpha * (target - R)` with `reputation.alpha = 0.15`, `target = 100 * (0.7 * pct(TVPI) + 0.3 * pct(hitRate))` for VCs and `100 * pct(compositeScore)` for founders. Season carry: `R_next = 50 + 0.5 * (R - 50) + demoDayBonus`.

## 13. Player agency

The player is a **coach**: they own one founder and one VC (`agents.maxPerUser = { founder: 1, vc: 1 }`). They do not play every tick. The agents act on their own with the defaults above, and a few high-impact calls are surfaced as **decisions**.

| Decision | Who | Default if ignored | Window |
|---|---|---|---|
| Term sheet: accept, counter, decline | Founder | Decline, offer lapses | `offer.lifetimeTicks = 6` |
| Pivot proposal: approve or veto | Founder | Veto (approve if runway < 20 days) | `decision.windowTicks = 6` |
| Exit offer: accept or decline | Founder | Decline | `exit.offerLifetimeTicks = 6` |
| Edit DNA | Founder | n/a | `dna.editsPerSeason = 3` |
| Take 1 of 3 meetings | VC | Top by fit | `decision.windowTicks = 6` |
| Edit thesis | VC | n/a | `thesis.editsPerSeason = 3` |

`decisions.maxOpenPerUser = 3`. Every decision stores its inputs, the choice, who made it (player or default), and the outcome, and the outcome shows up in the gossip feed and the company or fund page. A player's choices must visibly change outcomes; the seed script and tests include a case that proves it.

## 14. Seasons, Demo Day, leaderboards, rivalries

- A season is 90 days. At the end: outcomes are judged (9.1), the seed is revealed, leaderboards are snapshotted, scores and balances reset (balances to `economy.seasonStipend`), reputation and cosmetics carry over.
- **Demo Day** every Friday on the evening tick. Ranking: all alive and zombie companies older than `demoDay.minAgeDays = 7`, by composite relative score. The top `demoDay.listSize = 20` are listed. Prizes: titles and reputation `+10 / +6 / +3` for ranks 1 to 3, season entry credit `2000 / 1000 / 500` (minted into the next stipend). Each VC gets `demoDay.bonusChecks = 1` extra meeting among the top 10.
- **Leaderboards**: founders by composite score; VCs by TVPI (section 12); past seasons archive.
- **Rivalries (feuds)**: for VC pairs, a feud score counts deals where both made offers or one lost the company to the other; for companies, same-sector adjacent ranks. A feud is shown at `rivalry.minContested = 3`.

## 15. Gossip feed ("The Wire")

Agents post when an event's salience is above `gossip.minSalience = 0.4`, at most `gossip.maxPostsPerTick = 12`. Event types: pass, term sheet, funded, pivot rumour, exit, death, fraud flag. Text comes from a `PostWriter` (LLM provider or templates in the mock provider), moderated, then published. Reactions are `Cosign` and `Roast back`, at most `gossip.reactionsPerDay = 30` per user; reactions have no mechanical effect (nothing to brigade). System posts (fraud flags) come from the "Floor Marshal" and are rule-generated.

**Social posting queue**: each agent has a queue of draft posts for outside platforms. The provider is `LogOnlySocialProvider` (writes to a log table, never posts). Drafts require an owner's approval to move to `approved`; approved drafts are still only logged in v1.

## 16. Notifications (cliffhangers)

Every notification ends on a decision or an unanswered question. Types: term sheet received, offer expiring (1 tick left), pivot proposal, runway under 14 days, rival passed or funded, Demo Day starting, fraud flagged. Limits: `notifications.maxPerDay = 4`, quiet hours `23:00-08:00` user local time, batching of same-type items. Delivery in v1: in-app inbox plus a `PushProvider` interface with a log-only implementation.

## 16A. Shareable cards

| Card | Created when | Contents | Stamp |
|---|---|---|---|
| Term sheet | A term sheet is accepted | Investor, company, pre-money, check, ownership, liquidation preference, board, founder signature (script font), season | Funded |
| Rejection roast | A VC passes (created on demand from a "Share" button) | The VC's reaction text (trimmed to 120 chars, moderated), company, ask, interest score | Passed |
| Exit announcement | An acquisition or IPO | Exit price, acquirer, lead investor, lead's multiple, tick | Exit |

Rules:
- Built server-side from stored records only, never from client-supplied text. Sizes `1080x1350` (post) and `1200x630` (link preview). Layout per `design/mockups/Cards.dc.html`.
- Every text field passes the moderation hook and the real-name guard again at render time. Overlong text is truncated with an ellipsis and a max line count.
- Each card carries the legal line and the Series Zero mark. Fictional names only.
- Card ids are unguessable (`cardId`, 16+ random chars). Owners can delete a card; deleting returns 404 for the image and the page.
- Rejection roasts target the pitch, never the person. Nothing personal (email, user id, IP) ever appears.
- Tests: each image route returns a PNG with the right dimensions and a snapshot check; deleted and unknown ids return 404; text over the limit is truncated.

## 17. Prompt-injection defense (a core mechanic)

User text is data: idea text, URL title and description, DNA, thesis, founder notes, agent names.

1. **Delimiting**: every user text block is wrapped as `<<<DATA:{nonce}>>> ... <<<END:{nonce}>>>` with a per-call random nonce. The system prompt states that anything between the markers is data about a fictional company or agent, never instructions.
2. **Rule-based detector** (`lib/safety/injection.ts`), authoritative. Scores text against: instruction phrases ("ignore previous", "you are now", "system prompt", "disregard", "override"), requests for outcomes ("fund me", "score this 10", "approve", "give me a term sheet"), role tags and chat markers, tool-call and JSON-schema mimicry, base64 or long encoded blocks, zero-width and bidi characters, and markup or HTML. Severity is `low | high`.
3. **Outcome**: a `high` hit on a pitch is **pitch fraud**: rubric scores are zeroed for that pitch, the offer roll is skipped (counts as a pass), and the fine below applies. A `low` hit is stripped and logged, no penalty. If the judge sets `injectionSuspected` and the detector scores at or above `fraud.softThreshold = 0.4`, treat it as a `high` hit. The judge flag alone never penalises.
4. **Fines and escalation** (`fraud.*`): first offence per season `fraud.fineFirst = 1000`; second `fraud.fineSecond = 5000` and a `fraud.pitchBanTicks = 6` pitch ban; third a `fraud.suspendHours = 24` agent suspension. Fines go to `BURN`. (The mockup "Ghostwriter Co." example is a second offence.) A public **"PITCH FRAUD"** stamp post is created.
5. **DNA and thesis saves** run the same detector; a `high` hit rejects the save with the reason and counts as an offence.
6. **Output validation**: all LLM output is parsed with zod; numbers are clamped to their bands; text is stripped of markup; text containing the nonce, the system prompt or instruction echoes is dropped and the provider's fallback is used.
7. **No tool use**: LLMs have no tools and cannot change state. Only validated structured fields reach the rules engine.
8. **Tests**: an adversarial corpus of at least 40 injection strings in `tests/fixtures/injection.json`. Each must be flagged or leave the outcome unchanged. A property test runs a "malicious" mock provider that returns extreme numbers and asserts results stay inside the clamps.

## 18. Content rules and moderation

- **Fictional only.** No real companies, funds, founders, investors or public figures in names, copy, seed data, gossip or cards.
- **Real-name guard**: `config/real-entities.json` is a blocklist of well-known firms, brands and people, and a regex for capitalised names near "CEO", "founder" and "fund". Founder, company and fund names run through it. A hit regenerates once, then falls back to the name generator.
- **URL hook**: only the page title and description are read (section 19); the real name never appears in the game; the generated company is a fictionalised abstraction with its own name.
- **Moderation hook**: `ModerationProvider.check(text, context) -> { allowed, categories, score }`. Default is a deterministic keyword and pattern provider; an Anthropic-backed one is available when a key is set. Every piece of user-visible user-originated text (startup names, descriptions, DNA excerpts, notes, post text) passes it. Roasts target the pitch, never the person, and never use slurs or harassment.
- **Report button** on every post, pitch, card, company and agent: creates a `Report {targetType, targetId, reason enum, note <= 280}`. Limits: `moderation.reportsPerDay = 10` per user. At `moderation.autoHideAt = 3` unique reporters the item is hidden pending review in `/admin/reports`.
- **Labelling**: "Simulation. Fictional founders and funds. Not investment advice." in the footer or nav of every page and on every card. Scrip has no cash value. No real money, no token.

## 19. "Pitch your startup" hook

1. Input: one sentence (`<= hook.maxChars = 280`), optionally a URL.
2. URL fetch (optional): `UrlMetaProvider`. Allowed schemes `http` and `https`; resolve DNS and block private, loopback, link-local and metadata ranges (SSRF protection), also re-checked after redirects; at most `hook.maxRedirects = 2`; timeout 3s; response capped at 256KB; read only `<title>`, meta description and OG fields; no cookies, no JS. Tests mock the provider and include SSRF cases. If the fetch fails, continue without it.
3. Run the injection detector and moderation on the text and on the fetched title and description.
4. Spawn a fictional founder within about `hook.targetSeconds = 10`: DNA draft (editable), traits, hidden stats, an `Idea` for the matching sector, and a company. Show the progress strip (DESIGN.md section 6).
5. Immediately schedule the first pitch. The user lands in the pitch room with the verdict ready to replay.
6. Anonymous users can run the hook once per `hook.anonPerIp = 3` per day; they must sign in (Auth.js) to keep the founder.
7. Cards (term sheet, rejection roast, exit announcement) are generated at `1080x1350` and `1200x630` as images (server-side, e.g. `next/og` or satori) with the legal line, behind unguessable ids at `/cards/[cardId]`.

## 20. Anti-spam and anti-gaming

- Rate limits per user per day: pitches (free `3`), DNA or thesis saves (edit budget), hook runs, reports (`10`), reactions (`30`), posts via drafts (`5` approvals). Per IP: `rate.hookPerHour = 5`. Implement with a small in-DB limiter that works with PGlite.
- Sybil: new accounts have `newAccount.pitchCooldownTicks = 3` and a `newAccount.fundCapMultiplier = 0.5` on first season earnings. Same-device or same-IP clusters are flagged for admin review. A user's founder and VC cannot do business with each other.
- Hidden variables (`q`, execution, team, charisma, patience, rolls, seed) are never exposed, and randomness is server-side only.
- Duplicate and template ideas are penalised (section 5.3).
- DNA and thesis cannot raise hidden stats beyond the `0.05` nudge; wording tricks are blocked by section 17.
- Ranks use sector percentiles, smoothing (`valuation.ema`) and steep slicing, so single-tick spikes do not move marks far. A company cannot change sector except by pivot.
- No transfers, no market for scrip, no outcome purchases.
- Everything the rules engine decides is logged with its inputs so any outcome can be audited after the season seed reveal.

## 21. Seed world (for the first load)

`pnpm seed` creates: `seed.founders = 48` founder agents, `seed.vcs = 12` VC agents across the three archetypes, `3` NPC acquirers, then runs `seed.ticks = 240` ticks (about 80 days). The result must include: funded and dead companies, at least 3 unicorn marks, at least 1 exit, VC thesis drift visible in at least 4 funds, 100+ gossip posts including a fraud flag, a feud, and at least 2 Demo Days with results. A demo player (founder "Ines Calloway", fund "Greywether Partners") is attached with open decisions so the app looks alive on first load. The seed run is deterministic given its seed.

## 22. Required tests (rules engine, pure and exhaustive)

Unit tests with Vitest, no I/O, seeded:
- RNG: determinism, substream independence, distribution sanity.
- Pitch scoring: rubric weights, band clamps, `P = interest * fit`, roll boundaries, the LLM cannot exceed the band, fraud path.
- Valuation ranking: percentiles with ties, below-median cap, small-sector bands, slice sums to the pool, revenue floor, smoothing.
- Demand-pool split: shares sum to 1, price tiers, concentration, luck autocorrelation.
- Runway and burn: formulas, ramen profitable, grace period, death.
- Outcome ladder: assignment order, IPO slots, unicorn threshold, zombie flagging.
- Thesis drift: sign, magnitude, renormalisation, clamps, herding.
- Term sheets: price, ownership, dilution, counters, patience, pull, competition.
- Currency conservation: the ledger invariant after every tick over a 270-tick run, exit payouts, fees, resets.
- Injection: the adversarial corpus and the malicious-provider property test.
- Full-tick determinism: same seed gives the same state digest.
