/** Real-name guard (GAME.md section 18). Pure; the blocklist ships as JSON. */
import entities from "@/config/real-entities.json";

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LIST: string[] = [...entities.firms, ...entities.brands, ...entities.people].map(norm).filter((x) => x.length >= 2);

/** "Capitalised names near CEO, founder and fund". */
const NEAR_ROLE = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+),?\s+(?:the\s+)?(?:CEO|founder|co-founder|cofounder|chairman|investor|partner)\b|\b(?:CEO|founder|co-founder)\s+(?:of\s+\w+\s+)?([A-Z][a-z]+\s[A-Z][a-z]+)\b/;

export interface RealNameHit {
  hit: boolean;
  match?: string;
}

/** True when `text` contains a blocklisted real entity as a whole word sequence. */
export function realNameHit(text: string): RealNameHit {
  const n = ` ${norm(text)} `;
  for (const e of LIST) {
    if (n.includes(` ${e} `)) return { hit: true, match: e };
  }
  return { hit: false };
}

/** For free text (posts, notes): blocklist plus the capitalised-name-near-role pattern. */
export function realNameInText(text: string, knownFictional: ReadonlySet<string> = new Set()): RealNameHit {
  const b = realNameHit(text);
  if (b.hit) return b;
  const m = text.match(NEAR_ROLE);
  if (m) {
    const name = (m[1] ?? m[2] ?? "").trim();
    if (name && !knownFictional.has(name)) return { hit: true, match: name };
  }
  return { hit: false };
}
