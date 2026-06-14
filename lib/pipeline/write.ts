import type { Corridor, Pillar, Claim } from "../question-unit";
import type { RetrievedSpan } from "./types";
import { anthropic, MODEL, textOf, parseJson } from "../anthropic";

/**
 * Writer — drafts a unit from retrieved spans. Hard constraint: every claim must bind
 * to one of the provided spans (by sourceId + locator). Ungrounded claims are dropped
 * before return. Interpretive material is framed as general information, never asserted
 * as a conclusion. The draft is unverified — it must pass `verify` before shipping.
 */

export interface DraftUnit {
  directAnswer: string;
  keyTakeaways: string[];
  sections: { heading: string; body: string }[];
  corridorDelta?: string;
  checklist: string[];
  claims: Claim[];
}

export interface WriteRequest {
  question: string;
  corridor: Corridor;
  pillar: Pillar;
  riskTier: "factual" | "interpretive";
  spans: RetrievedSpan[];
  /** Optional operator instruction for a steered regeneration. */
  guidance?: string;
}

interface RawDraft {
  directAnswer: string;
  keyTakeaways: string[];
  sections: { heading: string; body: string }[];
  corridorDelta?: string;
  checklist: string[];
  claims: { text: string; sourceId: string; locator: string }[];
}

// Structured-output schema so the API returns valid JSON every time (no parse failures).
const WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["directAnswer", "keyTakeaways", "sections", "corridorDelta", "checklist", "claims"],
  properties: {
    directAnswer: { type: "string" },
    keyTakeaways: { type: "array", items: { type: "string" } },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: { heading: { type: "string" }, body: { type: "string" } },
      },
    },
    corridorDelta: { type: "string" },
    checklist: { type: "array", items: { type: "string" } },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "sourceId", "locator"],
        properties: { text: { type: "string" }, sourceId: { type: "string" }, locator: { type: "string" } },
      },
    },
  },
};

/** Strip em-dashes (kept out of all generated copy); leave en-dashes for pairs/ranges. */
const noEmDash = (s: string) => (s ?? "").replace(/\s*—\s*/g, ", ");

export async function writeUnit(req: WriteRequest): Promise<DraftUnit> {
  const validSourceIds = new Set(req.spans.map((s) => s.chunk.sourceId));
  const spanList = req.spans
    .map((s, i) => `[span ${i}] sourceId=${s.chunk.sourceId} locator=${s.chunk.locator}\n${s.chunk.text}`)
    .join("\n\n");

  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    // Guarantee valid JSON output.
    ...({ output_config: { format: { type: "json_schema", name: "unit", schema: WRITER_SCHEMA } } } as Record<string, unknown>),
    system:
      "You write for InterGest Canada, the definitive reference for German companies " +
      "setting up and operating in Canada. Write like the sharpest cross-border advisory " +
      "firm, NOT a compliance memo. The reader is a busy founder or finance lead who has to " +
      "make a decision. Make it specific, concrete, and genuinely useful, not dry.\n\n" +
      "RULES:\n" +
      "1. Ground every factual statement in the provided official source spans and cite each " +
      "claim's sourceId and locator. Never invent figures, thresholds, sections, forms, or " +
      "rules. Worked examples are encouraged, but any number or rule inside an example must " +
      "come from the sources; do not fabricate specifics.\n" +
      "2. Pull the actual thresholds, amounts, section references, form names, and deadlines " +
      "out of the spans. Specificity is the product.\n" +
      "3. NEVER write meta-commentary (no 'general information only', no mention of sources " +
      "being missing, of being an AI, or of your own limitations). If you lack material, " +
      "write less, but never narrate that.\n" +
      "4. directAnswer: answer the exact question in 2-4 confident sentences. No hedging preamble.\n" +
      "5. keyTakeaways: 3-5 crisp, scannable bullets the reader can act on.\n" +
      "6. sections: make it decision-useful and vivid, not a list of rules. Where the sources " +
      "support it, include: the rule and what it depends on; a concrete WORKED EXAMPLE applying " +
      "it to a typical German-company scenario; a 'What this means for your expansion' section " +
      "with the strategic implication; and a 'Where it goes wrong' section covering the common " +
      "mistakes and their consequences. Short paragraphs and bullets. You may use a single " +
      "'> ' callout line for the most important point.\n" +
      "7. corridorDelta: the concrete difference for a German parent (treaty, CFC / " +
      "Außensteuergesetz, totalization, CETA), grounded.\n" +
      "8. checklist: concrete next actions (forms, registrations, decisions), only if supported.\n" +
      "9. Interpretive matters (treaty application, PE, transfer pricing, immigration " +
      "eligibility): give the rule and the deciding factors, state plainly the outcome depends " +
      "on the company's facts; do NOT assert their conclusion or add sales language.\n" +
      "Voice: clear, confident, human, specific. NEVER use em-dashes; use commas or periods. " +
      "Cover the decision end to end without padding. Respond with a single JSON object only.",
    messages: [
      {
        role: "user",
        content:
          `Question: ${req.question}\nCorridor: ${req.corridor}\nPillar: ${req.pillar}\n` +
          `Risk tier: ${req.riskTier}\n\nRetrieved official source spans:\n${spanList}\n\n` +
          (req.guidance ? `Operator guidance (prioritise this, but stay grounded in the sources): ${req.guidance}\n\n` : "") +
          `Return JSON with this shape:\n` +
          `{"directAnswer": "...", "keyTakeaways": ["..."], "sections": [{"heading": "...", "body": "..."}], ` +
          `"corridorDelta": "...", "checklist": ["..."], ` +
          `"claims": [{"text": "...", "sourceId": "<one of the span sourceIds>", "locator": "<that span's locator>"}]}`,
      },
    ],
  });

  const raw = parseJson<RawDraft>(textOf(msg));

  // Enforce grounding: drop any claim not bound to a provided span.
  const claims: Claim[] = (raw.claims ?? [])
    .filter((c) => c.sourceId && c.locator && validSourceIds.has(c.sourceId))
    .map((c) => ({ text: noEmDash(c.text), sourceId: c.sourceId, locator: c.locator, verified: false }));

  return {
    directAnswer: noEmDash(raw.directAnswer ?? ""),
    keyTakeaways: (raw.keyTakeaways ?? []).map(noEmDash),
    sections: (raw.sections ?? []).map((s) => ({ heading: noEmDash(s.heading), body: noEmDash(s.body) })),
    corridorDelta: raw.corridorDelta ? noEmDash(raw.corridorDelta) : undefined,
    checklist: (raw.checklist ?? []).map(noEmDash),
    claims,
  };
}
