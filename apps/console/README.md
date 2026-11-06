# ScanUganda Console

Web dashboard for manufacturers, UNBS inspectors and administrators. React + Vite + Tailwind v4. Talks to `apps/api` only.

## Run

```
# terminal 1: the API (see apps/api/README.md), on port 3000
pnpm --filter @scanuganda/api dev

# terminal 2: the console, on http://localhost:5174
pnpm --filter @scanuganda/console dev
```

In development the console calls `/v1/...` on its own origin and Vite forwards to the API (`VITE_API_PROXY`, default `http://localhost:3000`), so no CORS setup is needed. For a deployed build, set `VITE_API_URL` to the API's address before `pnpm build` and add the console's origin to the API's `CORS_ORIGINS`.

Sign in with a seeded user (see the API README), e.g. `admin@scanuganda.test`.

## Pages

| Route | Who | What |
|---|---|---|
| `/` | all | Headline numbers, 7-day trend, alerts needing attention |
| `/batches`, `/batches/:id` | all (write: admin, manufacturer) | Batches; release units stage by stage; generate codes (CSV + printable QR sheet); recall |
| `/alerts` | all | Inbox with Open / Investigating / Resolved, priority filter |
| `/feed` | all | Live scans, refreshed every 5 s, filter by result |
| `/map` | all | Scans on a map with each area's sale zone |
| `/team` | admin | Users and manufacturers |

## Notes

- **Generated codes are shown once.** The API keeps the 12-digit codes only as a hash. The page keeps them in memory until dismissed; download the CSV or print before leaving.
- Design tokens live in `src/index.css` (`@theme`) and follow `docs/DESIGN.md`. Use them; no one-off colours.
- Tests: `pnpm --filter @scanuganda/console test`. Vitest has its own config (`vitest.config.ts`) because its bundled Vite does not type-check against the app's Vite 8 plugins.
