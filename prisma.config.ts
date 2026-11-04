import { defineConfig } from "prisma/config";

// The datasource URL is only used by Prisma CLI commands against a real Postgres
// (e.g. `prisma migrate deploy` on Neon). Local dev/test uses PGlite via lib/db.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/series_zero" },
});
