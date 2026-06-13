# IG-Docs — Corridor Authority Engine (App 1)

A corridor-specific knowledge hub for **InterGest Canada**. Its job is to become the
single most-cited, most-authoritative answer to *"how does a company from
[Germany / Austria / Switzerland / UK / ...] set up and operate in Canada?"* across
traditional search and AI assistants (ChatGPT, Claude, Perplexity, Gemini).

We do not try to out-rank governments or the Big Four on generic terms. We win the
narrow, **zero-competition, corridor-specific** questions no one has authoritatively
answered — and we win them completely.

> This repo is **App 1** only. The Prospecting Engine (App 2) is a separate tool with
> separate urgencies and **shares no code** with this repo.

---

## Operating reality (this is what shapes the design)

These constraints are deliberate and load-bearing. Do not design against the generic
brief; design against these:

1. **No in-house source-country expert. The system *is* the expert.** There is no
   network of 49 partners supplying or vouching for the German/Austrian/Swiss side.
   Therefore content safety comes entirely from **source-grounding**, not from a
   human knowing the law.

2. **One operator (the principal).** Review capacity is one person who is *not* a
   source-country tax/legal expert. So the human's job is **"is this claim actually
   supported by the cited official source?"** — never "is this the correct legal
   conclusion?" The pipeline must present claim-next-to-source to make that check
   possible.

3. **Official primary sources only.** Canadian government + source-country government
   / official bodies. **No blogs, no secondary commentary.** This is where real
   experts source from, and it is what search/AI systems require before citing YMYL
   ("Your Money or Your Life") content. See [`docs/sources.md`](docs/sources.md).

4. **90-day goal: a published, credible, indexed corpus.** Not a demand test — an
   actual body of authoritative corridor content live on the web.

### The core safety rule

> **No source span, no claim.** Every factual assertion must be wired to a specific
> retrieved span of an official primary source. A claim with no supporting source is
> rejected before it can be written, not after.

Interpretive/advisory material (treaty application, permanent establishment, transfer
pricing, immigration eligibility) is **never asserted as a conclusion.** It is framed
as general information and routed to a booked call. The handoff is the designed
boundary *and* the lead-capture mechanism.

---

## Content architecture

A shared **Canadian base layer** (mechanics that are the same for everyone) plus a
**per-corridor overlay** (source-country deltas). Write the base once; each corridor
adds its overlay. The overlay is where the depth and the moat live.

**Seven pillars** (entry → operate → thrive):

| # | Pillar | Layer |
|---|--------|-------|
| 1 | Decide & Structure (branch vs subsidiary, treaty-driven choice) | corridor-sensitive |
| 2 | Incorporate & Register (federal/provincial, business numbers, GST/HST) | base |
| 3 | Banking & Capital In (foreign-owned account, KYC, funding, thin-cap) | corridor-sensitive |
| 4 | Tax & Accounting (corp tax, payroll, transfer pricing, withholding/PE) | corridor-sensitive |
| 5 | People & Immigration (permits, ICT, treaty pathways, social security) | most corridor-sensitive |
| 6 | Operate & Comply (filings, annual returns, employment law) | base |
| 7 | Grow & Raise (financing, grants, M&A, listing) | corridor-sensitive + always human-gated |

Every unit follows the same template: see [`docs/question-unit-spec.md`](docs/question-unit-spec.md).

### Corridor priority

DACH (Germany/Austria/Switzerland) → UK → USA → Australia → New Zealand → Japan → India.

**Build one corridor deep before starting the next.** Five shallow corridors defeat
the purpose. DACH is first: it is where the client proof (Liqui Moly, Krombacher,
Duerr) and the strongest pull already are.

---

## Build sequence

- **Phase 0 — define "good" by hand.** Produce the first 5–10 DACH question-units
  with Claude + uploaded official sources, every claim cited. These become the gold
  standard the pipeline must reproduce. *(Foundation in this repo now.)*
- **Phase 1 — grounded generation pipeline.** Source ingestion, citation-required
  generation, dual-retrieval verification, MDX rendering for the factual tier.
- **Phase 2 — one-click review surface.** Claim-next-to-source approval cards for the
  single operator. Approve / reject + comment.
- **Phase 3 — RAG chatbot** grounded strictly in the approved corpus (lead capture).
- **Phase 4 — freshness loop.** Scheduled monitoring of the official source set; diffs
  flag units for re-review.

## Repo layout

```
docs/
  question-unit-spec.md   The atomic question-unit: schema, template, rules
  sources.md              Official-source registry (Canada + DACH). Official only.
schema/
  question-unit.schema.json   Machine-validatable schema for a unit
content/
  units/dach/             Corridor units (MDX with frontmatter)
```
