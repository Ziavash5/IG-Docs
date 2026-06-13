# Deploy & Setup (Vercel + Supabase)

What you do, in order, to take this from repo to a live app you can use.

> **Current state matters:** the public site shell builds and deploys today. The
> content pipeline (ingest → retrieve → write → verify) is wired to interfaces but the
> live calls are still stubbed. Doing this setup is exactly what unblocks wiring it —
> once the keys + database exist, the pipeline gets connected and content flows.

---

## 1. Supabase (the corpus database)

1. Create a project at <https://supabase.com> → **New project**. Pick a region close to
   your users (e.g. Canada/US East). Save the database password.
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](../supabase/schema.sql), and **Run**. This enables `pgvector`
   and creates the `sources`, `chunks`, `units`, `claims`, and `review_queue` tables.
3. Click the green **Connect** button (top of the dashboard) → copy a connection
   string. This is your `DATABASE_URL`.
   - For the Vercel app (serverless), use the **Transaction pooler** string (port
     `6543`): `postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres`
   - Replace `[PASSWORD]` with your DB password (reset it under Project Settings →
     Database if needed).

   > ⚠️ **Not the same as the Data API URL.** The REST endpoint shown under
   > Integrations → Data API (`https://<ref>.supabase.co/rest/v1/`) is **not**
   > `DATABASE_URL`. `DATABASE_URL` always starts with `postgresql://`.

## 2. API keys (the brains)

1. **Claude:** <https://console.anthropic.com> → **API Keys** → create one →
   `ANTHROPIC_API_KEY`.
2. **Voyage (embeddings):** <https://dashboard.voyageai.com> → create a key →
   `VOYAGE_API_KEY`.

## 3. Vercel (hosting)

1. <https://vercel.com> → **Add New → Project** → import the GitHub repo
   `Ziavash5/IG-Docs`.
2. Framework is auto-detected as **Next.js** — no build config needed.
3. Under **Environment Variables**, add (from `.env.example`):
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY`
   - `DATABASE_URL`
4. **Deploy.** You get a live URL. Set the production branch to `main` (or promote this
   branch) when you're ready.

## 4. Local development (optional)

```bash
cp .env.example .env.local   # fill in the three values
npm install
npm run dev                  # http://localhost:3000
```

---

## What works at each stage

| After step | You have |
|------------|----------|
| 3 (deploy) | The public site shell live (home + nav, Swiss layout). No content yet. |
| Pipeline wired (next dev task, needs the keys above) | Ingest official sources → corridor-aware retrieval → cited drafts → verified units → your approval queue → published corpus. |

**Never commit secrets.** `.env*` is gitignored; real keys live only in Vercel and your
local `.env.local`.
