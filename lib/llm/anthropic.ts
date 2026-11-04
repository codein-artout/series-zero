/**
 * AnthropicProvider: used only when ANTHROPIC_API_KEY is set. No tools. One JSON object per call.
 * Server-side refusal fallbacks are enabled ("default" routing). A refusal or any error makes the
 * caller fall back to the deterministic mock (lib/llm/call.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmRequest } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export class RefusalError extends Error {}

export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  private client: Anthropic;
  constructor(
    apiKey: string,
    private model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    private timeoutMs = 20_000,
  ) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
    this.name = `anthropic:${this.model}`;
  }

  async complete(req: LlmRequest): Promise<string> {
    const params = {
      model: this.model,
      max_tokens: Math.max(req.maxTokens, 2000),
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: req.system,
      messages: [{ role: "user" as const, content: req.user }],
    };
    const res = await this.client.beta.messages.create(params as unknown as Parameters<typeof this.client.beta.messages.create>[0], {
      timeout: this.timeoutMs,
    });
    const msg = res as Anthropic.Beta.BetaMessage;
    if (msg.stop_reason === "refusal") throw new RefusalError("model declined");
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return text;
  }
}
