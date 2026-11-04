export type LlmTask = "traits" | "idea" | "judge" | "post" | "dna" | "news" | "moderation";

export interface LlmRequest {
  task: LlmTask;
  system: string;
  user: string;
  /** Structured copy of the input. Only the MockProvider reads it; real providers get the prompt text. */
  input: unknown;
  /** Stable key for deterministic mock output (never the season seed). */
  key: string;
  maxTokens: number;
  nonce: string;
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<string>;
}

export interface CallMeta {
  provider: string;
  attempts: number;
  fallback: boolean;
  reason?: string;
}
