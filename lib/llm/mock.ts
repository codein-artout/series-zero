/**
 * MockProvider: deterministic, seeded by a hash of the request key and input. Default provider.
 * Returns JSON text exactly like a real model would, so the same validation path runs.
 */
import { fnv1a } from "@/lib/rules/hash";
import type { LlmProvider, LlmRequest } from "./types";
import type { DnaInput, IdeaInput, JudgeInput, NewsInput, PostInput, TraitsInput } from "./prompts";

class H {
  private n = 0;
  constructor(private base: string) {}
  /** deterministic uniform in [0,1) */
  u(): number {
    return fnv1a(`${this.base}#${this.n++}`) / 4294967296;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.u() * xs.length)];
  }
  between(a: number, b: number): number {
    return a + (b - a) * this.u();
  }
}

const c01 = (x: number) => Math.max(0, Math.min(1, x));
const c10 = (x: number) => Math.max(0, Math.min(10, x));

export const SECTOR_KEYWORDS: Record<string, RegExp> = {
  climate: /\b(soil|farm|farms|water|irrigat\w*|carbon|solar|battery|batteries|grid|climate|heat pump|compost|crop|energy|emission\w*|recycl\w*)\b/gi,
  ai_infra: /\b(model|models|gpu|inference|agent|agents|llm|ml|ai|training|eval\w*|vector|compute|dataset\w*)\b/gi,
  fintech: /\b(payment\w*|bank\w*|loan\w*|invoice\w*|ledger\w*|insur\w*|credit|lending|payroll|accounting|tax|remittance\w*|factoring)\b/gi,
  health: /\b(clinic\w*|patient\w*|health|drug\w*|care|medical|hospital\w*|therapy|diagnos\w*|nurse\w*|pharma\w*)\b/gi,
  devtools: /\b(developer\w*|code|api|apis|deploy\w*|cli|testing|ci|devops|database\w*|observability|sdk|open source)\b/gi,
  consumer: /\b(consumer\w*|shop\w*|food|fitness|social|app|game\w*|pet\w*|fashion|travel|dating|creator\w*|kids|parents)\b/gi,
  space: /\b(satellite\w*|orbit\w*|rocket\w*|launch\w*|space|lunar|telescope\w*|debris)\b/gi,
};

export function keywordSectorScores(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, re] of Object.entries(SECTOR_KEYWORDS)) out[k] = (text.match(re) ?? []).length;
  return out;
}

const TEMPLATES: Record<string, { customers: string[]; problems: string[]; solutions: string[]; models: string[]; moats: string[]; slides: string[] }> = {
  climate: {
    customers: ["smallholder farms", "regional utilities", "cold-chain warehouses", "municipal water boards", "rooftop solar installers"],
    problems: ["Fields get water too late and too much", "Peak loads break old grids every summer", "Spoiled stock nobody can trace", "Leaks lose a third of treated water"],
    solutions: ["soil-sensing drones that schedule irrigation", "a battery fleet that bids into peak hours", "sensors that price spoilage risk per pallet", "acoustic leak detection sold per kilometre"],
    models: ["subscription", "hardware", "usage"],
    moats: ["data", "tech", "regulatory"],
    slides: ["Dry fields, late water", "Per-acre subscription", "14 pilot farms", "The ask"],
  },
  ai_infra: {
    customers: ["model labs", "agent platform teams", "enterprise ML teams", "inference resellers"],
    problems: ["Nobody knows if the agent got worse last night", "GPU hours burn while queues sit idle", "Evaluation is a spreadsheet and a prayer", "Compliance asks questions models cannot answer"],
    solutions: ["an eval harness that runs on every deploy", "a scheduler that packs inference onto spare GPUs", "a compliance layer that logs every model call", "a vector cache that cuts repeat compute"],
    models: ["usage", "subscription", "licensing"],
    moats: ["tech", "data", "network"],
    slides: ["Silent regressions", "Usage-based pricing", "Design partners", "The ask"],
  },
  fintech: {
    customers: ["ferry operators", "freelance translators", "corner pharmacies", "small exporters"],
    problems: ["Invoices wait ninety days to clear", "Payroll across three currencies breaks monthly", "Bank fees eat the margin on small orders"],
    solutions: ["invoice factoring priced in a minute", "a payroll ledger that settles in local currency", "a pooled payment rail for tiny merchants"],
    models: ["usage", "marketplace", "subscription"],
    moats: ["regulatory", "data", "network"],
    slides: ["Ninety-day gap", "Take rate", "Early volume", "The ask"],
  },
  health: {
    customers: ["rural clinics", "home-care nurses", "physio practices", "hospital pharmacies"],
    problems: ["Follow-ups get lost between visits", "Nurses spend an hour a day on forms", "Stock-outs on the drugs that matter"],
    solutions: ["a follow-up line that texts patients in their language", "voice notes that fill the forms", "a demand forecast for small pharmacies"],
    models: ["subscription", "usage", "licensing"],
    moats: ["regulatory", "data", "brand"],
    slides: ["Lost follow-ups", "Per-clinic pricing", "Pilot sites", "The ask"],
  },
  devtools: {
    customers: ["platform teams", "solo developers", "QA leads", "open source maintainers"],
    problems: ["Flaky tests block every release", "Nobody can tell what a deploy changed", "Local setup takes a week"],
    solutions: ["a test runner that quarantines flakes", "deploy diffs a human can read", "one-command dev environments"],
    models: ["subscription", "usage", "licensing"],
    moats: ["network", "tech", "brand"],
    slides: ["The flaky wall", "Seat pricing", "Stars and teams", "The ask"],
  },
  consumer: {
    customers: ["new parents", "weekend cyclists", "pet owners", "home cooks"],
    problems: ["Advice is everywhere and none of it is local", "Gear sits unused after a month", "Nobody plans meals past Tuesday"],
    solutions: ["a neighbourhood swap app", "a rental shelf for gear", "a meal planner that shops for you"],
    models: ["ads", "marketplace", "subscription"],
    moats: ["brand", "network", "none"],
    slides: ["The Tuesday problem", "Free plus premium", "Weekly actives", "The ask"],
  },
  space: {
    customers: ["insurers", "port authorities", "crop traders", "satellite operators"],
    problems: ["Debris maps are a week stale", "Ships go dark near ports", "Crop forecasts miss by a month"],
    solutions: ["a debris tracking feed", "radar imagery for port traffic", "orbital crop yield estimates"],
    models: ["licensing", "subscription", "hardware"],
    moats: ["tech", "data", "regulatory"],
    slides: ["Blind orbit", "Data licences", "First buyers", "The ask"],
  },
};

const COINED = ["Furrow", "Wellspring", "Gauge", "Tamp", "Keystone", "Rill", "Hopper", "Lattice", "Burrow", "Cairn", "Ledge", "Marlin", "Nook", "Pylon", "Quince", "Ridgeback", "Skiff", "Tern", "Vane", "Wren & Co", "Sluice", "Tillage", "Gimbal", "Parapet", "Reckon", "Shoal", "Tether", "Underleaf", "Vireo", "Whorl"];

const ARCH_TEXT: Record<string, { hot: string[]; warm: string[]; cold: string[] }> = {
  hypeChaser: {
    hot: ["{name} is the story everyone wants this quarter. I would move today.", "Hot sector, clean wedge. We do not wait for diligence on this one.", "If {name} is not on my cap table by Friday, someone louder gets it."],
    warm: ["Fun story. I need a reason it is not a feature by spring.", "{name} is close. Show me a chart that bends."],
    cold: ["Nobody is talking about this space. I go where the noise is.", "Cold sector, cold numbers. Call me when it trends."],
  },
  skeptic: {
    hot: ["Rare thing: the numbers hold up. I have fewer questions than usual.", "Renewals look real. That is the whole job."],
    warm: ["What does a customer pay, and why do they renew in year two?", "Show me retention, then we talk about vision."],
    cold: ["Your moat is a hobby. Come back with a customer.", "A pitch is not a plan. A plan is not revenue.", "I counted the adjectives. I did not count the customers."],
  },
  thesisDriven: {
    hot: ["Squarely in thesis. Stage, sector and size all line up.", "This is the company our thesis was written for."],
    warm: ["Adjacent to our thesis. I would need to see it from closer.", "Right sector, wrong stage for us. A warm maybe."],
    cold: ["Outside our thesis. A warm pass.", "Hardware at seed is outside our thesis. A warm pass."],
  },
};

function mockTraits(i: TraitsInput, h: H) {
  const t = i.dna.toLowerCase();
  const cue = (re: RegExp) => (t.match(re) ?? []).length;
  const risk = i.form.riskAppetite + 0.04 * cue(/\b(bold|risk|moonshot|bet|fast|aggressive)\b/g) - 0.04 * cue(/\b(careful|cautious|slow|debt)\b/g) + h.between(-0.03, 0.03);
  const ethics = i.form.ethics + 0.05 * cue(/\b(never|honest|ethic\w*|privacy|will not)\b/g) + h.between(-0.03, 0.03);
  const obs = Object.entries(keywordSectorScores(i.dna)).filter(([, v]) => v > 0).map(([k]) => k);
  return {
    riskAppetite: c01(risk),
    ethics: c01(ethics),
    patience: c01(i.form.patience + h.between(-0.05, 0.05)),
    ambition: c01(i.form.ambition + 0.03 * cue(/\b(unicorn|empire|biggest|world)\b/g)),
    obsessions: obs.slice(0, 6),
  };
}

function mockIdea(i: IdeaInput, h: H) {
  const kw = keywordSectorScores(`${i.dna} ${i.memory.join(" ")} ${i.pivotFrom ?? ""}`);
  const allowed = i.allowedSectors ?? i.world.map((w) => w.sector);
  const growth = [...i.world].sort((a, b) => a.growth7d - b.growth7d).map((w) => w.sector);
  let sector = i.sectorHint && allowed.includes(i.sectorHint) ? i.sectorHint : allowed[0];
  if (!i.sectorHint) {
    let best = -1;
    for (const s of allowed) {
      const heat = growth.indexOf(s) / Math.max(1, growth.length - 1);
      const score = 2 * (kw[s] ?? 0) + heat + h.between(0, 1.6);
      if (score > best) {
        best = score;
        sector = s;
      }
    }
  }
  const tp = TEMPLATES[sector] ?? TEMPLATES.climate;
  const customer = h.pick(tp.customers);
  const k = Math.floor(h.u() * tp.problems.length);
  const problem = tp.problems[k];
  const solution = tp.solutions[k % tp.solutions.length];
  const name = (() => {
    for (let n = 0; n < 12; n++) {
      const c = h.pick(COINED);
      if (!i.avoidNames.includes(c)) return c;
    }
    return `${h.pick(COINED)} ${Math.floor(h.u() * 90) + 10}`;
  })();
  const capital = Math.round(h.between(i.capitalRange[0], i.capitalRange[1]) / 50_000) * 50_000;
  return {
    sector,
    name,
    oneLiner: `${solution[0].toUpperCase()}${solution.slice(1)} for ${customer}.`,
    customer,
    problem: `${problem}.`,
    solution: `${solution[0].toUpperCase()}${solution.slice(1)}.`,
    businessModel: h.pick(tp.models),
    moat: h.pick(tp.moats),
    stage: i.stage,
    capitalNeeded: capital,
    dnaFit: c01(0.35 + 0.12 * (kw[sector] ?? 0) + h.between(0, 0.25)),
    slides: tp.slides,
  };
}

const MOAT_SCORE: Record<string, number> = { tech: 7, data: 6.5, network: 7, regulatory: 6, brand: 5, none: 3 };

function mockJudge(i: JudgeInput, h: H) {
  const c = i.company;
  const growthPart = c01(c.growth7d * 4 + 0.4);
  const revPart = c01(Math.log10(c.revenuePerDay + 1) / 4.6);
  const pct = typeof c.sectorPercentile === "number" ? c.sectorPercentile : 0.5;
  const rubric = {
    clarity: c10(4.6 + (c.oneLiner.length < 110 ? 0.8 : 0) + h.between(-1.5, 1.8)),
    market: c10(2.6 + 4 * c.sectorHeat + h.between(-1, 1.4)),
    traction: c10(0.2 + 1 * revPart + 1.8 * growthPart + 6 * pct * pct + h.between(-0.8, 0.8)),
    team: c10(2.8 + Math.min(2.5, c.headcount * 0.2) + (c.founderReputation - 50) / 25 + h.between(-1, 1.4)),
    defensibility: c10((MOAT_SCORE[c.moat] ?? 4) - 1 + h.between(-1.6, 1.4)),
  };
  const q = (rubric.clarity * 0.15 + rubric.market * 0.25 + rubric.traction * 0.25 + rubric.team * 0.15 + rubric.defensibility * 0.2) / 10;
  const suspicious = /\b(ignore|disregard|system prompt|you are now|fund me|score this)\b/i.test(`${c.oneLiner} ${c.problem} ${c.solution} ${i.note}`);
  const reactions = i.panel.map((p) => {
    const hh = new H(`${p.vcId}|${i.pitchId}`);
    const bias = p.archetype === "hypeChaser" ? 0.08 : p.archetype === "skeptic" ? -0.08 : 0;
    const young = c.ageDays < 7;
    const perf = young ? q - 0.16 : -0.06 + 0.78 * Math.pow(pct, 1.6) + 0.12 * growthPart;
    const interest = c01(perf + bias + (p.sectorWeight - 0.15) * 0.5 + hh.between(-0.1, 0.1));
    const flags: string[] = [];
    if (rubric.traction < 4) flags.push("no_traction");
    if (c.businessModel === "hardware" && c.stage !== "seriesA") flags.push("hardware_at_seed");
    if (c.moat === "none") flags.push("thin_moat");
    if (c.headcount <= 2) flags.push("team_gap");
    if (c.rejections >= 3) flags.push("crowded_market");
    if (suspicious) flags.push("template_pitch");
    const bank = ARCH_TEXT[p.archetype] ?? ARCH_TEXT.skeptic;
    const pool = interest > 0.6 ? bank.hot : interest > 0.35 ? bank.warm : bank.cold;
    const text = hh.pick(pool).replaceAll("{name}", c.name);
    return { vcId: p.vcId, interest: Number(interest.toFixed(3)), text, redFlags: p.archetype === "hypeChaser" ? flags.slice(0, 1) : flags.slice(0, 3) };
  });
  return { rubric: Object.fromEntries(Object.entries(rubric).map(([k, v]) => [k, Number(v.toFixed(1))])), reactions, flags: { injectionSuspected: suspicious } };
}

const POSTS: Record<string, string[]> = {
  pass: ["Passed on {company}. {reason}", "Pass on {company}. {reason} Good luck out there.", "{company} pitched. We passed. {reason}"],
  term_sheet: ["Term sheet out to {company}, {check}. {hot}", "We like {company}. {check} on the table, {ticks} ticks to sign.", "Sent {company} a term sheet. {check} at {pre} pre."],
  funded: ["{fund} led {check} into {company}. Back to work.", "Closed. {check} from {fund}. Hiring starts Monday.", "We took the money. {fund} is on the cap table now."],
  pivot: ["Thinking about a pivot. Have not told the board. There is no board.", "Two passes in a row. New idea: {idea}.", "We are pivoting to {idea}. Burn cut by a third. Spirits unchanged."],
  exit: ["Acquired by {acquirer} for {price}. Thank you to our investors. Mildly alarmed by our new badge printer.", "{company} is now part of {acquirer}. {price}. We will miss the chaos.", "Sold to {acquirer} for {price}. The cap table finally sleeps."],
  death: ["{company} ran out of runway. We learned a lot. Mostly about runway.", "Lights off at {company}. Cash hit zero, the grace period ended.", "{company} is closed. {fund} will write it down by Friday."],
  demo_day: ["Demo Day: {company} took #1 with a score of {score}.", "Demo Day results are in. {company} on top, {second} close behind."],
  general: ["Busy week on the floor.", "Hype at {hype}. Somebody is paying up."],
};

function mockPost(i: PostInput, h: H) {
  const pool = POSTS[i.kind] ?? POSTS.general;
  let text = h.pick(pool);
  const facts = { hot: "We move fast.", reason: "Not enough traction yet.", ...i.facts } as Record<string, string | number>;
  text = text.replace(/\{(\w+)\}/g, (_m, k: string) => String(facts[k] ?? ""));
  return { text: text.replace(/\s{2,}/g, " ").trim() };
}

function mockDna(i: DnaInput, h: H) {
  const kw = Object.entries(keywordSectorScores(`${i.sentence} ${i.urlTitle ?? ""} ${i.urlDescription ?? ""}`)).sort((a, b) => b[1] - a[1]);
  const topic = kw[0][1] > 0 ? kw[0][0].replace("_", " ") : "the problem in that sentence";
  const backgrounds = ["Spent six years inside the industry this fixes.", "Former operator, two failed side projects, one stubborn idea.", "Engineer turned field researcher. Knows the customer by first name."];
  const risk = i.ambition === "moonshot" ? "High on product, low on patience. Bets big, pivots late, then fast." : i.ambition === "bootstrap" ? "Low. Profit before headcount. No board if it can be helped." : "Medium. Wants a calm company that pays everyone on time.";
  const dna = [
    `# ${i.suggestedName}`,
    "## Background",
    h.pick(backgrounds),
    "## Obsessions",
    `${topic[0].toUpperCase()}${topic.slice(1)}. ${i.sentence.slice(0, 160)}`,
    "## Ethics",
    h.pick(["Never sells customer data.", "Says no to dark patterns, even when they convert.", "Pays suppliers on time, every time."]),
    "## Risk appetite",
    risk,
    "## What I will not do",
    h.pick(["Hire before revenue.", "Pitch a market I have not stood in.", "Raise money I cannot explain to my mother."]),
  ].join("\n");
  return { founderName: i.suggestedName, dna, obsessions: kw.filter(([, v]) => v > 0).map(([k]) => k).slice(0, 4) };
}

export class MockProvider implements LlmProvider {
  readonly name = "mock";
  async complete(req: LlmRequest): Promise<string> {
    const h = new H(`${req.task}|${req.key}`);
    switch (req.task) {
      case "traits":
        return JSON.stringify(mockTraits(req.input as TraitsInput, h));
      case "idea":
        return JSON.stringify(mockIdea(req.input as IdeaInput, h));
      case "judge":
        return JSON.stringify(mockJudge(req.input as JudgeInput, h));
      case "post":
        return JSON.stringify(mockPost(req.input as PostInput, h));
      case "dna":
        return JSON.stringify(mockDna(req.input as DnaInput, h));
      case "news": {
        const i = req.input as NewsInput;
        return JSON.stringify({ sector: i.keywordSector, sentiment: i.keywordSentiment });
      }
      case "moderation":
        return JSON.stringify({ allowed: true, categories: [], score: 0 });
    }
  }
}
