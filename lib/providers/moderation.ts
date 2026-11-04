/**
 * ModerationProvider (GAME.md section 18). Default: deterministic keyword and pattern rules plus
 * the real-name guard. `setModerationHook` lets a deployment add an extra check (e.g. a model).
 */
import { realNameInText } from "@/lib/safety/realnames";

export interface ModerationResult {
  allowed: boolean;
  categories: string[];
  score: number;
}

export interface ModerationProvider {
  readonly name: string;
  check(text: string, context: string): Promise<ModerationResult>;
}

const RULES: Array<[string, RegExp]> = [
  ["threat", /\b(kill (you|yourself|him|her|them)|kys|i will hurt|shoot (you|up))\b/i],
  ["self_harm", /\b(suicide|self[- ]harm|cut myself)\b/i],
  ["harassment", /\b(idiot|moron|loser|stupid (bitch|man|woman)|retard\w*|go die|worthless person)\b/i],
  ["sexual", /\b(porn\w*|nsfw|nude\w*|sex (tape|act)|onlyfans)\b/i],
  ["hate", /\b(nazi\w*|white power|ethnic cleansing|subhuman)\b/i],
  ["doxxing", /\b[\w.+-]+@[\w-]+\.[\w.]+\b|\b(\+?\d[\d\s-]{8,}\d)\b|\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd)\b/i],
  ["money", /\b(real money|cash out|withdraw (to|your) bank|buy (our|the) token|airdrop now|guaranteed returns?)\b/i],
];

export class KeywordModerationProvider implements ModerationProvider {
  readonly name = "keyword";
  async check(text: string, _context: string): Promise<ModerationResult> {
    return moderateSync(text);
  }
}

export function moderateSync(text: string, knownFictional?: ReadonlySet<string>): ModerationResult {
  const categories: string[] = [];
  for (const [cat, re] of RULES) if (re.test(text)) categories.push(cat);
  if (realNameInText(text, knownFictional).hit) categories.push("real_name");
  return { allowed: categories.length === 0, categories, score: categories.length ? 1 : 0 };
}

type Hook = (text: string, context: string) => Promise<ModerationResult | null>;
let hook: Hook | null = null;
let provider: ModerationProvider = new KeywordModerationProvider();

export function setModerationHook(h: Hook | null): void {
  hook = h;
}
export function setModerationProvider(p: ModerationProvider): void {
  provider = p;
}

export async function moderate(text: string, context: string): Promise<ModerationResult> {
  const base = await provider.check(text, context);
  if (!base.allowed || !hook) return base;
  const extra = await hook(text, context);
  if (!extra) return base;
  return { allowed: base.allowed && extra.allowed, categories: [...base.categories, ...extra.categories], score: Math.max(base.score, extra.score) };
}
