# The Atomic Question-Unit

The question-unit is the core object of this entire system. The CMS, the generation
pipeline, the verifier, and the later RAG chatbot are all built on top of it. Get this
right and everything downstream is assembly. Get it wrong and everything downstream is a
rebuild.

## Why "atomic"

AI retrieval works at the **passage level**, not the page level. An assistant
decomposes *"how does a German GmbH set up a Canadian subsidiary?"* into sub-questions
and retrieves passages that answer each one. So we structure content as discrete,
directly-answerable units that **pre-answer the exact sub-questions** an assistant
asks. One unit = one question a real foreign-entry buyer actually has.

## The template (every unit, no exceptions)

1. **The direct answer** — answer the question in the first 1–3 sentences. This is the
   passage that gets retrieved and cited.
2. **The rule** — what the official source actually says, with the citation inline.
3. **What determines how it applies** — the variables (entity type, treaty status,
   province, residency of directors, etc.).
4. **How it differs for your corridor** — the source-country delta. *This is the moat.*
   For base-layer units this section is omitted.
5. **Checklist / timeline** — concrete steps, forms, fees, deadlines.
6. **The handoff** — "This is general information. Your specific situation depends on X.
   Book a call." This keeps the unit on the educational (low-liability, high-authority)
   side of the advice line *by construction*, and is the lead-capture mechanism.

## Risk tiers (this decides the path through the pipeline)

| Tier | Examples | Path |
|------|----------|------|
| **factual / procedural** | incorporation steps, fees, deadlines, forms, GST/HST thresholds | source-verifiable → ships automatically if cited and verified |
| **interpretive / advisory** | treaty application, permanent establishment, transfer pricing, immigration eligibility | **never asserted** — framed as general info, routed to a booked call, human-gated |

## The citation rule

**No source span, no claim.** Every factual assertion in `claims[]` must reference a
specific source from [`sources.md`](sources.md) (by `source_id`) and the URL/locator of
the supporting span. A claim with no support is rejected at generation time.

The single human operator's review question is therefore always:
**"Does the cited official source actually support this claim?"** — a check a
non-expert can perform reliably. It is *never* "is this the correct legal conclusion?"

## Frontmatter schema (authored as MDX)

```yaml
---
id: dach-pillar1-branch-vs-subsidiary           # stable unique id
slug: germany-branch-vs-subsidiary-canada       # URL slug
question: "Should a German company open a Canadian branch or a subsidiary?"
pillar: 1                                        # 1–7
layer: overlay                                   # base | overlay
corridor: dach                                   # base | dach | uk | usa | ...
jurisdictions: [CA, DE]                          # ISO country codes touched
risk_tier: interpretive                          # factual | interpretive
status: draft                                    # draft | in_review | published
author:
  name: ""                                       # bylined human (the operator)
  credentials: ""                                # E-E-A-T requirement
last_reviewed: 2026-06-13                         # mandatory, visible on page
claims:
  - text: "A federal corporation is incorporated under the CBCA."
    source_id: justice-cbca
    locator: "https://laws-lois.justice.gc.ca/eng/acts/C-44/"
    verified: false
citations: [justice-cbca, cra-corp-tax, fin-ca-de-treaty]
cta: "Book a 20-minute Canada-entry call"
---
```

Mandatory on every published unit (YMYL / E-E-A-T): **author byline + credentials**,
**visible `last_reviewed` date**, **every claim cited**, and **JSON-LD structured data**
emitted at render time.
