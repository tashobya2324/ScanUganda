# Free, always-on deployment (works when nobody's PC is on)

Three free pieces, each on its own account. About 20 minutes. Check each provider's current free-plan terms before you start.

| Piece | Where | Cost |
|---|---|---|
| Web system + mobile app | Cloudflare (already set up, see [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md)) | free |
| Database | Supabase (Postgres); Neon works the same way | free |
| API | Render web service (`render.yaml` in the repo root) | free |

Caveat: a free Render service sleeps after about 15 minutes without traffic. The first request after that takes up to a minute. **Open the site a few minutes before a demo.**

## 1. Database (Supabase)

1. Sign up at supabase.com and create a project. Save the database password you choose.
2. Click **Connect** at the top of the project and copy the **Session pooler** connection string (it ends in `pooler.supabase.com:5432`). Put your password in place of `[YOUR-PASSWORD]`.
   - Use the pooler, not "Direct connection": the direct address is IPv6-only on the free plan and many hosts cannot reach it.
3. Only the database is used. You do not need Supabase's login, storage or API features.

**Free-plan catch:** Supabase pauses a free project after about a week without activity. Before a demo, open the project in the dashboard and press **Restore** if it is paused. (Neon, or any Postgres, can be used instead: only `DATABASE_URL` changes.)

## 2. API (Render)

1. Sign up at render.com with the GitHub account that can see this repo.
2. New > Blueprint > pick this repo. Render reads `render.yaml`.
3. When asked for `DATABASE_URL`, paste the Supabase string. `TOKEN_SECRET`, `LOOKUP_PEPPER` and `KEY_ENCRYPTION_KEY` are generated for you.
4. **Back these three up** (Render > service > Environment > copy to a password manager). Losing `LOOKUP_PEPPER` breaks every printed 12-digit code; losing `KEY_ENCRYPTION_KEY` means no new codes for existing batches.
5. Deploy. The API applies its database migrations itself on start. Check `https://<name>.onrender.com/health`.

## 3. Create the first admin

Do **not** use the demo password on a public site. Load the sample data once, from your PC, with your own password and the same secrets Render holds:

```powershell
$env:DATABASE_URL="postgres://…supabase pooler string…"
$env:TOKEN_SECRET="…"; $env:LOOKUP_PEPPER="…"; $env:KEY_ENCRYPTION_KEY="…"
$env:SEED_PASSWORD="a-strong-password-of-your-own"
pnpm seed
```

Sign in as `admin@scanuganda.test` with that password.

## 4. Point the Cloudflare site at the API

Cloudflare dashboard > the `scanuganda` Worker > Settings > Variables: set `API_ORIGIN` to `https://<name>.onrender.com` (no trailing slash). Save. No rebuild is needed.

Open the site and sign in. It now works with every PC off.

## Using the Workers Paid plan instead

If the group later accepts $5/month, `docs/DEPLOY.md` describes running the API as its own Worker (no sleeping).
