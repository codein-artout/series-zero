import fs from "node:fs";
import { deepMerge, defaultGameConfig, validateGameConfig, type GameConfig } from "./game";

let cached: GameConfig | null = null;

/** Loads defaults, deep-merges GAME_CONFIG_PATH JSON if set, validates with zod. Throws on invalid config. */
export function loadGameConfig(env: NodeJS.ProcessEnv = process.env): GameConfig {
  if (cached && !env.GAME_CONFIG_PATH_RELOAD) return cached;
  let merged: unknown = defaultGameConfig;
  if (env.GAME_CONFIG_PATH) {
    const raw = JSON.parse(fs.readFileSync(env.GAME_CONFIG_PATH, "utf8")) as unknown;
    merged = deepMerge(defaultGameConfig, raw);
  }
  cached = validateGameConfig(merged);
  return cached;
}
