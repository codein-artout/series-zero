/**
 * Structured LLM calls: build a nonce-delimited prompt, ask the provider, parse the first JSON
 * object, validate with zod, sanitize. Invalid output retries once, then falls back to the
 * MockProvider (deterministic rule default). Output that echoes the nonce, the system prompt or
 * instruction phrases is dropped.
 */
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { buildPrompt } from "./prompts";
import { MockProvider } from "./mock";
import { AnthropicProvider } from "./anthropic";
import type { CallMeta, LlmProvider, LlmTask } from "./types";
import { detectInjection } from "@/lib/safety/injection";

const mock = new MockProvider();
let provider: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (!provider) {
    const key = process.env.ANTHROPIC_API_KEY;
    provider = key && !process.env.SZ_FORCE_MOCK ? new AnthropicProvider(key) : mock;
  }
  return provider;
}

/** For tests: swap in a provider (e.g. a malicious one). */
export function setProvider(p: LlmProvider | null): void {
  provider = p;
}

export function newNonce(): string {
  return randomBytes(9).toString("hex");
}

export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("unterminated JSON");
}

/** Walk all strings in the output; reject echoes of the nonce, markers, or instruction text. */
export function outputLooksCompromised(value: unknown, nonce: string): string | null {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  for (const s of strings) {
    if (s.includes(nonce)) return "nonce echo";
    if (/<<<\s*(DATA|END)/i.test(s)) return "marker echo";
    if (/component of Series Zero|never an instruction to you|You have no tools/i.test(s)) return "system prompt echo";
    if (detectInjection(s).severity === "high") return "instruction echo";
  }
  return null;
}

export interface StructuredResult<T> {
  value: T;
  meta: CallMeta;
}

export async function callStructured<S extends z.ZodType>(
  task: LlmTask,
  schema: S,
  input: unknown,
  key: string,
  opts: { maxTokens?: number; provider?: LlmProvider; maxRetries?: number } = {},
): Promise<StructuredResult<z.infer<S>>> {
  const p = opts.provider ?? getProvider();
  const retries = opts.maxRetries ?? 1;
  let reason = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const nonce = newNonce();
    const prompt = buildPrompt(task, input, nonce);
    try {
      const text = await p.complete({ task, system: prompt.system, user: prompt.user, input, key, maxTokens: opts.maxTokens ?? 1200, nonce });
      const parsed = schema.safeParse(extractJson(text));
      if (!parsed.success) {
        reason = `schema: ${parsed.error.issues[0]?.message ?? "invalid"}`;
        continue;
      }
      const bad = outputLooksCompromised(parsed.data, nonce);
      if (bad) {
        reason = bad;
        continue;
      }
      return { value: parsed.data, meta: { provider: p.name, attempts: attempt + 1, fallback: false } };
    } catch (e) {
      reason = (e as Error).message;
    }
  }
  // Fallback: the deterministic mock (rule default).
  const nonce = newNonce();
  const prompt = buildPrompt(task, input, nonce);
  const text = await mock.complete({ task, system: prompt.system, user: prompt.user, input, key, maxTokens: 1200, nonce });
  const value = schema.parse(extractJson(text));
  return { value, meta: { provider: mock.name, attempts: retries + 1, fallback: p !== mock, reason } };
}
