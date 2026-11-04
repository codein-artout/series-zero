# DEPLOY.md

Target: **Vercel + Neon Postgres**. Nothing in this repo deploys itself; follow these steps by hand.

## 1. Database (Neon)

1. Create a Neon project and copy the pooled connection string.
2. Apply migrations from your machine or CI:
   ```bash
   DATABASE_URL="postgres://..." pnpm prisma migrate deploy
   ```
   The SQL in `prisma/migrations/*` is the same SQL the embedded PGlite runner applies locally. The app also applies any missing migration on first connection (`lib/db/migrate.ts`), so either path works.
3. Seed the first season (optional but recommended):
   ```bash
   DATABASE_URL="postgres://..." pnpm seed
   ```
   This truncates every table first. Do not run it against a live season.

## 2. Vercel project

Environment variables (Production and Preview):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled URL. Without it the app falls back to PGlite, which does not persist on Vercel. |
| `AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | yes | `true` |
| `CRON_SECRET` | yes | Vercel Cron sends `Authorization: Bearer $CRON_SECRET` to `/api/cron/tick`. |
| `ADMIN_EMAILS` | yes | Comma-separated emails allowed into `/admin` in production. |
| `ANTHROPIC_API_KEY` | no | Enables `AnthropicProvider`. Unset = deterministic `MockProvider`. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5-5`. |
| `GAME_CONFIG_PATH` | no | JSON override for `config/game.ts` (deep-merged, zod-validated). |
| `SEASON_SEED` | no | Seed for the next season on rollover; random if unset. Keep it secret until the season ends. |

`vercel.json` sets the install and build commands and three daily crons at 02:00, 10:00 and 18:00 Asia/Kolkata (20:30, 04:30, 12:30 UTC), matching `ticks.schedule`. Change both together if you change the schedule.

## 3. Email

Magic links are printed to the server log only. Production email needs a transport: replace `sendVerificationRequest` in `auth.ts` with your mail provider. Until then players use the guest account.

## 4. Checks after deploy

- `GET /api/health` returns `{ ok: true }`.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/tick` advances one tick; repeating with `?to=N` is idempotent.
- `/admin` shows "Ledger: Balanced".

## Notes

- Fonts are bundled from `@fontsource`; no runtime font or CDN requests. Card images read the WOFF files from `node_modules/@fontsource` at runtime, so keep them in the deployment (default Next.js file tracing includes them via `fs` reads under `process.cwd()`; if your platform trims `node_modules`, add them to `outputFileTracingIncludes`).
- The social layer never posts outside the app (`LogOnlySocialProvider`). Push notifications are written to `PushLog` only.
