import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    // A fresh seeded database for every e2e run, then the production build.
    command: `pnpm exec tsx scripts/seed.ts && pnpm exec next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PGLITE_DIR: "./.data/e2e",
      DATABASE_URL: "",
      AUTH_SECRET: "e2e-secret",
      AUTH_TRUST_HOST: "true",
      CRON_SECRET: "e2e-cron",
      SZ_OPEN_ADMIN: "1",
      SZ_DEMO_LOGIN: "1",
      SZ_URLMETA: "mock",
      ANTHROPIC_API_KEY: "",
    },
  },
});
