import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["lib/rules/**", "lib/sim/**", "lib/ledger/**"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
