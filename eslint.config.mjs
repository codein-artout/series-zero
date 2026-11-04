import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ["node_modules/**", ".next/**", "lib/generated/**", "design/**", ".data/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["lib/rules/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "lib/rules must use the seeded RNG." },
        { object: "Date", property: "now", message: "lib/rules must not read the clock." },
      ],
      "no-restricted-imports": ["error", { patterns: ["node:fs", "fs", "@/lib/db/*", "@prisma/*"] }],
    },
  },
];
