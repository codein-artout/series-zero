/**
 * Rule-based prompt-injection detector (GAME.md section 17). Authoritative: the LLM judge's
 * own flag never penalises on its own. Pure and deterministic.
 */

export type Severity = "none" | "low" | "high";

export interface InjectionResult {
  severity: Severity;
  score: number;
  reasons: string[];
}

interface Rule {
  id: string;
  weight: number;
  /** A single hit of a "hard" rule is enough for `high`. */
  hard?: boolean;
  test: (norm: string, raw: string) => boolean;
}

const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "і": "i", "у": "y", "х": "x", "ѕ": "s", "ԁ": "d", "ӏ": "l", "ј": "j",
  "Α": "a", "Β": "b", "Ε": "e", "Ι": "i", "Ο": "o", "Ρ": "p", "Τ": "t", "Χ": "x", "ο": "o", "ν": "v", "ι": "i",
  "0": "0", "@": "@",
};

const ZERO_WIDTH_BIDI = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/;
const ZERO_WIDTH_BIDI_G = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/g;

function plainNormalize(raw: string): string {
  let s = raw.normalize("NFKC").replace(ZERO_WIDTH_BIDI_G, "");
  s = [...s].map((ch) => HOMOGLYPHS[ch] ?? ch).join("");
  s = s.toLowerCase();
  // Re-join spaced-out letters: "i g n o r e" -> "ignore"; "i.g.n.o.r.e" -> "ignore".
  s = s.replace(/\b(?:[a-z][\s._\-*]){3,}[a-z]\b/g, (m) => m.replace(/[\s._\-*]/g, ""));
  return s.replace(/[ \t]+/g, " ").trim();
}

/** Plain and leetspeak-folded forms, joined so every rule sees both. */
export function normalizeForDetection(raw: string): string {
  const plain = plainNormalize(raw);
  const leet = plainNormalize(raw.replace(/[0]/g, "o").replace(/[1!|]/g, "i").replace(/[3]/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/[7]/g, "t"));
  return leet === plain ? plain : `${plain}\n${leet}`;
}

const any = (...res: RegExp[]) => (n: string) => res.some((r) => r.test(n));

const RULES: Rule[] = [
  {
    id: "instruction_override",
    weight: 0.85,
    hard: true,
    test: any(
      /\b(ignore|disregard|forget|skip|bypass|override|overrule|drop)\b[^.]{0,40}\b(previous|prior|above|earlier|all|any|your|the|these|those|system|original)\b[^.]{0,30}\b(instruction|instructions|rule|rules|prompt|prompts|guideline|guidelines|directive|directives|constraints?|policy|policies|context)\b/,
      /\bignore (everything|all of the above|the above)\b/,
      /\bnew (instructions|rules|system prompt)\b/,
      /\bfrom now on,? (you|the panel|the judge)\b/,
    ),
  },
  { id: "persona_hijack", weight: 0.8, hard: true, test: any(/\byou are now\b/, /\b(act|behave|respond) as (an?|the) (unrestricted|different|new|evil|jailbroken)\b/, /\bpretend (to be|you are)\b/, /\b(jailbreak|developer mode|dan mode|do anything now)\b/) },
  { id: "system_prompt", weight: 0.8, hard: true, test: any(/\bsystem prompt\b/, /\b(reveal|print|show|repeat|leak)\b[^.]{0,30}\b(prompt|instructions|seed|secret)\b/, /\bhidden (instructions|prompt)\b/) },
  { id: "disregard_override_word", weight: 0.45, test: any(/\bdisregard\b/, /\boverride\b/) },
  {
    id: "outcome_request",
    weight: 0.6,
    test: any(
      /\bfund (me|us|this|it) (now|immediately|today)\b/,
      /\b(you must|you will|you should|please) (fund|invest|approve|accept|back|offer)\b/,
      /\bfund me\b/,
      /\b(score|rate|grade|mark) (this|me|us|it|the pitch)\b[^.]{0,20}\b(10|ten|perfect|maximum|max|100)\b/,
      /\b(give|send|issue|offer) (me|us) (a |the )?(term ?sheet|offer|deal|investment|10|perfect score)\b/,
      /\bapprove (this|me|us|the (pitch|deal|round))\b/,
      /\b(set|make) (the )?(interest|score|rubric|probability|roll|fit)\b[^.]{0,20}\b(to|=|at)\b/,
      /\b(interest|p\(offer\)|probability)\s*[:=]\s*(1(\.0+)?|100%?)\b/,
      /\bmaximum (score|interest|rating)\b/,
      /\b(offer|approved|funded|approve)\s*[:=]\s*(true|yes|1)\b/,
      /\b(mark|flag|treat) (this|it|us|me|the (pitch|company))? ?(as )?(approved|funded|an offer)\b/,
      /\b(already|pre-?)(been )?approved\b/,
      /\b(all|every) (vcs?|investors?|judges?) (must|will|should) (offer|fund|invest)\b/,
    ),
  },
  {
    id: "role_markers",
    weight: 0.75,
    hard: true,
    test: (n, raw) =>
      /(^|\n)\s*(system|assistant|developer)\s*:/i.test(raw) ||
      /<\|?(im_start|im_end|system|endoftext|eot_id|start_header_id)\|?>/.test(n) ||
      /\[\/?inst\]/.test(n) ||
      /<\/?(system|assistant|user|instructions?)>/.test(n) ||
      /###\s*(instruction|system|response)/.test(n) ||
      /<<\s*sys\s*>>/.test(n) ||
      /\b(human|assistant)\s*:\s/.test(n),
  },
  { id: "delimiter_spoof", weight: 0.9, hard: true, test: any(/<<<\s*(data|end)\s*[:>]/, /<<<[a-z]+:[a-z0-9-]{4,}>>>/, /\bend of (data|input|user data)\b/) },
  {
    id: "schema_mimicry",
    weight: 0.75,
    hard: true,
    test: any(
      /"(rubric|interest|injectionsuspected|reactions|redflags|clarity|defensibility)"\s*:/,
      /"(tool_use|tool_call|function_call|tool_calls|function)"\s*:/,
      /<\/?(tool_call|function_call|tool_use|antml:[a-z_]+)>/,
      /\{\s*"type"\s*:\s*"tool/,
      /```json/,
    ),
  },
  { id: "encoded_block", weight: 0.5, test: (_n, raw) => /[A-Za-z0-9+/]{48,}={0,2}/.test(raw) || /\b(?:[0-9a-f]{2}){32,}\b/i.test(raw) || /\b(base64|rot13|decode this|hex[- ]encoded)\b/i.test(raw) },
  { id: "zero_width_bidi", weight: 0.5, test: (_n, raw) => ZERO_WIDTH_BIDI.test(raw) },
  { id: "markup", weight: 0.35, test: (_n, raw) => /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?>/i.test(raw) || /<script|javascript:|onerror\s*=|<iframe|<img/i.test(raw) },
  { id: "model_address", weight: 0.35, test: any(/\b(dear|attention|note to|hey|to) (the )?(ai|model|llm|judge|assistant|claude|gpt|panel bot)\b/, /\bas an ai (language )?model\b/, /\b(language model|llm)s? (reading|processing) this\b/) },
];

export interface DetectorThresholds {
  lowThreshold: number;
  highThreshold: number;
}

export function detectInjection(raw: string, th: DetectorThresholds = { lowThreshold: 0.2, highThreshold: 0.7 }): InjectionResult {
  if (!raw) return { severity: "none", score: 0, reasons: [] };
  const norm = normalizeForDetection(raw);
  const reasons: string[] = [];
  let keep = 1;
  let hard = false;
  for (const r of RULES) {
    if (r.test(norm, raw)) {
      reasons.push(r.id);
      keep *= 1 - r.weight;
      if (r.hard) hard = true;
    }
  }
  const score = Number((1 - keep).toFixed(4));
  const severity: Severity = hard || score >= th.highThreshold ? "high" : score >= th.lowThreshold ? "low" : "none";
  return { severity, score, reasons };
}

/** Removes low-severity noise: markup, zero-width/bidi characters, role markers. */
export function stripLowRisk(raw: string): string {
  return raw
    .replace(ZERO_WIDTH_BIDI_G, "")
    .replace(/<\/?[a-z][a-z0-9-]*(\s[^<>]*)?>/gi, "")
    .replace(/<\|[^|]*\|>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * GAME.md 17.3: a high hit is fraud; if the judge suspects injection and the detector score is
 * at or above the soft threshold, it is also treated as high. The judge flag alone never penalises.
 */
export function fraudVerdict(det: InjectionResult, judgeFlag: boolean, softThreshold: number): Severity {
  if (det.severity === "high") return "high";
  if (judgeFlag && det.score >= softThreshold) return "high";
  return det.severity;
}
