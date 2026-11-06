# ScanUganda: Development Procedure

How everyone (people and agents) works on this repository. Follow it as written; if it is wrong, change it through a PR, do not work around it.

Related: [PLAN.md](PLAN.md) · [TASKS.md](TASKS.md) · [DESIGN.md](DESIGN.md)

## 1. Ground rules

1. **Authorship.** Commits, PRs and files carry the group members only. **No AI tool or agent is ever listed as author or co-author:** no `Co-Authored-By` lines, no "Generated with…" footers, no AI names in file headers, `package.json` author fields or docs. Agents must strip any such default.
2. **The board is the truth.** Work that is not on [TASKS.md](TASKS.md) does not happen; work that happens is reflected there.
3. **`main` always works.** It builds, passes CI and runs. Nobody pushes to it directly.
4. **Small steps.** One task → one branch → one PR. A task that cannot finish in a day is split first.
5. **No secrets in git.** Keys, tokens and `.env*` files stay local (already git-ignored). Share them through the team's private channel. The sample data and keys in the repo are for development only.
6. **Say what is unverified.** A PR description states what was tested and how. Do not mark anything `DONE` that has not been run.

## 2. Setup

```
git clone https://github.com/tashobya2324/ScanUganda.git
cd ScanUganda
pnpm install
pnpm dev          # starts all apps (after Phase 0 task P0-1)
pnpm test         # unit and integration tests
pnpm typecheck && pnpm lint
```

Requires Node and pnpm (versions in `.mise.toml`). Before P0-1 lands, the repo is the single prototype app: `npm install && npm run dev` (port 8443, or `$PORT`).

Camera, geolocation and service workers need HTTPS or `localhost`. To test on a phone, use a tunnel (e.g. `cloudflared`) or the deployed build.

## 3. Task workflow

### Picking up work
1. `git pull` and read [TASKS.md](TASKS.md): current phase, status, blockers, activity log.
2. Choose a `TODO` task in the **current phase** whose deps are all `DONE`. If you must work out of phase, ask first.
3. **Claim it:** set Owner to your name or agent label and Status to `IN PROGRESS`, add an activity-log line, and push that one-file change to `main` *as its own small commit* (the only allowed direct push) so others see it immediately. If the push conflicts, someone claimed first: pick another task.
4. Create a branch from `main`.

### While working
- Stay inside your task. Found something else? Add it to the Backlog or Blockers table, do not fix it in this PR.
- Stuck for more than 30 minutes: set `BLOCKED`, write the blocker in the Blockers table, pick another task.

### Finishing
1. Run `pnpm typecheck && pnpm lint && pnpm test` locally. All must pass.
2. Open a PR (see §5). Set the task to `REVIEW`.
3. After approval and merge, set the task to `DONE` with a log line. The person who merges does this.

### Agent-specific rules
- An agent works on **one task at a time** and only on files in that task's area (§4).
- Before editing any shared file (root config, `packages/core`, `TASKS.md`), `git pull` immediately beforehand.
- When an agent finishes or stops, it leaves the board in the true state: status, notes (what is done, what is left), and a log line. A task half-done is `IN PROGRESS` with a note, never `DONE`.
- Agents do not make architectural decisions silently: write a decision note (§7) and flag it in the PR.

## 4. Ownership by folder (conflict avoidance)

| Area | Folder | Rule |
|---|---|---|
| Verification rules, crypto, types | `packages/core` | Pure functions, no I/O, no framework imports. Changes need tests. |
| Backend | `apps/api` | Calls `core`; no business rules duplicated here. |
| Console | `apps/console` | Talks to the API only. |
| PWA | `apps/pwa` | Talks to the API only; may import `core` for offline verification. |
| Shared UI tokens/components | `packages/ui` (created in P0-4) | Changes announced in the PR title: `[ui]`. |
| Docs and board | `docs/` | Anyone may edit `TASKS.md`; others go through PR. |

Two people never hold tasks that edit the same files at the same time. If a task needs another area's code, ask the owner or split the task.

## 5. Git conventions

- **Branches:** `<phase-task>/<short-slug>`, e.g. `p1-8/temporal-rule`.
- **Commits:** imperative, present tense, ≤ 72-char subject, optional body explaining *why*. Reference the task: `Add impossible-travel rule (P1-8)`. **No trailers for AI authorship.**
- **PRs:** title = task ID + summary. Body: what changed, how it was tested (commands, screenshots for UI), anything unverified, board updated (yes/no). Squash-merge.
- **Review:** at least one other member approves; the author does not merge their own PR unless nobody is available and CI is green. Reviewers check against the task's acceptance criteria in PLAN.md and DESIGN.md.
- **No force-push to `main`.** Ever. (P0-8 is the single reviewed exception, if the team approves.)

## 6. Definition of done

A task is `DONE` only when **all** apply:
- [ ] Does what the task says, checked by running it (UI: in a browser, mobile viewport, and keyboard-only for interactive parts).
- [ ] Tests exist for logic (`core` and `api` mandatory; UI: key flows).
- [ ] Typecheck, lint, tests and build pass in CI.
- [ ] Follows DESIGN.md (UI tasks): tokens only, no one-off colours or fonts; empty, loading and error states exist.
- [ ] No debug code, no commented-out code, no TODOs without a board entry.
- [ ] Docs updated if behaviour, setup or API changed (OpenAPI for endpoints).
- [ ] Board updated and PR merged.

## 7. Decisions

Anything that changes an architecture decision in PLAN §2, adds a dependency of significance, or changes a rule in PLAN §3 gets a note: `docs/decisions/YYYY-MM-DD-title.md` with *Context, Decision, Consequences* (a few lines each). Link it in the PR. Update PLAN.md in the same PR.

## 8. Testing approach

| Layer | Tool | What |
|---|---|---|
| `core` | Vitest | Every rule, boundaries, scenario table. Coverage ≥ 90 %. |
| `api` | Vitest + temp SQLite DB | Every endpoint, auth and error paths. |
| UI components | Vitest + Testing Library | Verdict screens, forms, offline banner. |
| End to end | Playwright | PLAN §6 scenarios. |
| Manual | Real phones | Phase 6 round; log issues with severity: **S1** data loss/wrong verdict, **S2** flow blocked, **S3** annoying, **S4** cosmetic. |

A wrong verdict is always S1: this product exists to be right.

## 9. Environment and configuration

- Configuration via environment variables with a checked-in `.env.example` listing every variable (no real values).
- API signing private key: generated locally by a script, stored outside git. The repo's dev key is labelled `DEV ONLY`.
- Production values are set in the host's settings, never committed.

## 10. Weekly rhythm

- **Start of a work session:** pull, read the board and activity log.
- **End of a session:** update the board; push or park your branch.
- **Weekly team check (15 min):** review blockers, move the phase forward only if the exit gate in PLAN.md is met, re-cut scope using the MVP line.
- **Phase exit:** the gate checks are run by someone other than the person who built the phase; result is logged.

## 11. Handling problems

| Situation | Do |
|---|---|
| CI red on `main` | Stop merging; the last merger fixes or reverts within the hour. |
| Two people on the same task | The earlier claim in the log wins. Other moves on. |
| Requirement unclear | Add to Blockers with a specific question; do not guess on rules in PLAN §3. |
| Something you did is wrong | Say so in the PR or the log; fix forward or revert. |
