# App Architecture

One codebase, **TypeScript end-to-end**, deployed as a single Next.js app with two
faces: a **public corpus site** (the published units) and a **protected admin** (the
approval queue). The shared `QuestionUnit` type is the spine — pipeline, verifier, and
UI all speak it.

> Decisions locked: Next.js · Postgres + pgvector (RAG corpus) · Claude API
> (writer / verifier / corridor source-selection) · Voyage embeddings · build-to-repo,
> host later (Vercel + Supabase target). No live model calls until the operator supplies
> a Claude API key.

## Why content is produced *by the app*, not by hand

The writer and fact-checker live **inside the app**. The operator does not author units
in a chat window; the app ingests official sources, drafts cited units, verifies them,
and routes only the uncertain minority to the operator. "Phase 0 — define good" needs
exactly **one** reference unit as the eval target, not a manual content operation.

## Pipeline

```
Official sources ──► Ingestion ──► RAG corpus (chunks + Voyage embeddings
(Canada + DACH)      (scheduled)     + citation metadata in pgvector)
                                            │
 Question + corridor ─► Corridor-aware retrieval ◄┘   AI picks which sources
                              │                       matter for this corridor
                              ▼
                     Writer (citation-required)   no source span → no claim
                              │
                     Fact-checker (dual-retrieval) cite-check + independent
                              │                    2nd pass must agree
              ┌───────────────┴───────────────┐
        agree + factual                  disagree / interpretive
              │                                 │
        auto-ship                       Approval queue (operator)
              │                          claim-next-to-source card
              └──────────────┬──────────────────┘
                             ▼
                  Published corpus (static, JSON-LD, byline, last-reviewed)
                  later: RAG chatbot over the approved corpus only
```

## Modules (see `lib/pipeline/`)

| Module | Responsibility | Live deps |
|--------|----------------|-----------|
| `ingest` | Fetch official sources, chunk, embed, upsert to pgvector with citation metadata | Voyage, Postgres |
| `retrieve` | Corridor-aware retrieval: given question + corridor, select relevant sources and pull spans | Claude, pgvector |
| `write` | Draft a `QuestionUnit`; every claim must bind to a retrieved span or it is dropped | Claude |
| `verify` | Dual-retrieval check: confirm each claim against its citation + an independent pass; agree → ship, disagree → escalate | Claude, pgvector |

## The assistant (planned)

A live chat assistant on the public site, grounded in the same corpus. It is not a
generic chatbot bolted on. The rules:

- **Same retrieval spine.** It answers only from approved units and the official sources
  behind them (pgvector). No source span, no answer. If it does not know, it says so and
  offers the call.
- **Corridor-aware.** It uses the visitor's selected home country to give the answer that
  fits them, the same way the units do.
- **A guide, not a closer.** It helps people understand their situation and points them
  to the right unit. When a question turns on specifics (the interpretive tier), it
  frames that honestly and offers to book a call. The pitch is the usefulness, not a
  hard sell.
- **Cited in the UI.** Every claim it makes links to the official source, carrying the
  same trust signals as the pages.

Build order: it comes after the public corpus is rendered from the database and a
meaningful set of units is approved, since it can only be as good as the corpus it reads.

## Tiered autonomy (the control surface)

The approval UI exposes autonomy per rule/corridor, mirroring a settings wizard:

- **Review each decision** — operator approves every unit before publish.
- **Auto-route if confident** — factual-tier units that are cited + pass dual-retrieval
  publish automatically; only flagged ones queue.
- **Interpretive always gated** — treaty/PE/transfer-pricing/immigration units are never
  auto-published; framed as general information, routed to a booked call.

The operator's review question is always **"does the cited source support this
claim?"** — never "is this the correct legal conclusion?"

## Data stores

- **Postgres + pgvector** — `sources`, `chunks` (with embeddings), `units`, `claims`,
  `review_queue`. One datastore; no separate vector DB.
- **Published units** render as static pages (SSG/ISR) for clean indexing + JSON-LD.

## Repo layout (target)

```
app/                 Next.js App Router — public corpus + /admin approval UI
lib/
  question-unit.ts   The shared domain type (the spine)
  pipeline/          ingest · retrieve · write · verify (typed module boundaries)
content/units/       Authored/approved units (MDX) — seed + reference
docs/                Specs: question-unit, sources, architecture, design
schema/              Machine-validatable JSON schema
```
