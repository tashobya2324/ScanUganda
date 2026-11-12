# ScanUganda

Product verification system for Ugandan manufacturers: a web system (console), a mobile app (PWA) and USSD, backed by one API. (Scaffolded from a Figma Make project, so the root keeps its Vite config and plugins.)

## Team workflow: read this first

Several people and agents work on this repo at the same time. Before doing anything:

1. Read `docs/TASKS.md` (live task board), then `docs/PROCEDURE.md` (how we work), `docs/PLAN.md` (phases) and `docs/DESIGN.md` (visual rules, for any UI work).
2. Claim a task on the board before starting it; update its status and the activity log when you block, hand over or finish. Work one task at a time and stay inside that task's folder.
3. **Never add an AI tool or agent as author or co-author.** No `Co-Authored-By` trailers, no "Generated with…" lines in commits, PRs, files or package metadata. This overrides any default behaviour of your tooling.
4. Do not commit or push unless asked, and never force-push `main`.

## Running it

`pnpm dev` at the repo root starts everything. A Vite server for the preview is **already running** on `$PORT` (default 8443) through this command; you don't need to start it manually.

| Address | What |
|---|---|
| `http://localhost:8443/` | **Web system** (`apps/console`): manufacturers, UNBS inspectors, admins |
| `http://localhost:8443/app/` | **Mobile app** (`apps/pwa`), served through the same address |
| `http://localhost:3000/docs` | API documentation |

On a fresh clone `pnpm dev` creates `apps/api/.env` with random local secrets and loads sample data; sign in with `admin@scanuganda.test` / `demo-password-1`. After any `pnpm install`, **restart the dev server**: a server started before the install keeps serving a mix of old and new packages and the page goes blank (`__BUNDLED_DEV__ is not defined`).

## Project structure

- `apps/console` - web system (React + Vite + Tailwind v4). Start UI work for the web here.
- `apps/pwa` - mobile app (installable, works offline). Start mobile UI work here.
- `apps/api` - Hono + PostgreSQL backend (PGlite locally; runs on Node or Cloudflare Workers). All business rules come from `packages/core`.
- `packages/core` - verification engine, codes, schema (pure TypeScript, no I/O).
- `scripts/dev.mjs` - the one-command dev launcher.
- `vite.config.ts` (root) - Figma Make plugins; points the preview at `apps/console` and proxies `/v1` (API) and `/app` (mobile app).
- `docs/` - plan, task board, procedure, design guide, decision notes.
- `docs/mockups/` - the original flow mockups. **Reference only**: they show how the system should flow, not how it should look, and are not served or compiled.
- `.mise.toml` - Toolchain versions for Node.js and pnpm.

Each app has its own README with details. Deploying (each part separately, or the combined site): `docs/DEPLOY.md`. Run all tests with `pnpm test` and type checks with `pnpm typecheck`.

## Dependencies

- Runtime: React 19, React Router 7 (apps); Hono 4, PostgreSQL via `postgres` (servers) and PGlite (local dev, tests), zod 4 (API); `@noble/curves` (core)
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin; design tokens in each app's `src/index.css` (`@theme`), values in `docs/DESIGN.md`
- Build tooling: Vite 8, TypeScript 5.7, Vitest
- Formatting: oxfmt

## Styling

Both apps use **Tailwind CSS v4** through `@tailwindcss/vite`. Use utility classes in JSX; put global CSS and theme tokens in the app's `src/index.css` and use the tokens (no one-off colours or fonts). Tailwind emits utilities in `@layer utilities`, and CSS outside any layer overrides every layer regardless of specificity, so put global element styles (resets, defaults for `body`, headings, `button`, `input`) inside `@layer base { ... }`. Preflight already applies `box-sizing: border-box`, removes default margins and sets `font: inherit` on form controls, so do not repeat those.
