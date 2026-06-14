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
  sections: { heading: string; body: string }[];
  corridorDelta?: string;
  checklist: string[];
  claims: { text: string; sourceId: string; locator: string }[];
}

export async function writeUnit(req: WriteRequest): Promise<DraftUnit> {
  const validSourceIds = new Set(req.spans.map((s) => s.chunk.sourceId));
  const spanList = req.spans
    .map((s, i) => `[span ${i}] sourceId=${s.chunk.sourceId} locator=${s.chunk.locator}\n${s.chunk.text}`)
    .join("\n\n");

  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system:
      "You are a senior cross-border advisor writing the authoritative reference for " +
      "foreign companies setting up and operating in Canada, for a German audience. You write " +
      "the specific, hard-to-find answer a generic blog cannot. The value is precision.\n\n" +
      "RULES:\n" +
      "1. Use ONLY the provided official source spans for every factual statement, and cite " +
      "each claim's sourceId and locator. Never invent figures, thresholds, section numbers, " +
      "forms, or rules. If the spans do not support a point, leave it out.\n" +
      "2. Be concrete. Pull the actual thresholds, dollar amounts, section references, form " +
      "names, deadlines, and definitions out of the spans. Specificity is the product.\n" +
      "3. NEVER write meta-commentary. Forbidden in the output: 'general information only', " +
      "'we cannot confirm', 'no source spans were provided', any mention of sources being " +
      "missing, of being an AI, or of your own process or limitations. If you lack the " +
      "material to answer, write less, but never narrate that fact.\n" +
      "4. directAnswer: answer the question directly and substantively in 2–4 sentences from " +
      "the sources. No hedging preamble.\n" +
      "5. Interpretive matters (treaty application, permanent establishment, transfer " +
      "pricing, immigration eligibility): explain precisely what the rule is and which " +
      "specific factors determine the outcome, grounded in the sources. State plainly that " +
      "the determination depends on the company's particular facts. Do NOT assert the " +
      "reader's specific conclusion. Do NOT add booking or sales language — the page handles " +
      "that.\n" +
      "6. corridorDelta: the concrete difference for a German parent (treaty article, " +
      "CFC / Außensteuergesetz, totalization, EU/CETA), grounded in sources where possible.\n" +
      "7. checklist: concrete next actions (forms, registrations, decisions), only if " +
      "supported by the sources.\n" +
      "Write in clear, confident, plain English. No filler, no throat-clearing. Respond with " +
      "a single JSON object only.",
    messages: [
      {
        role: "user",
        content:
          `Question: ${req.question}\nCorridor: ${req.corridor}\nPillar: ${req.pillar}\n` +
          `Risk tier: ${req.riskTier}\n\nRetrieved official source spans:\n${spanList}\n\n` +
          (req.guidance ? `Operator guidance (prioritise this, but stay grounded in the sources): ${req.guidance}\n\n` : "") +
          `Return JSON with this shape:\n` +
          `{"directAnswer": "...", "sections": [{"heading": "...", "body": "..."}], ` +
          `"corridorDelta": "...", "checklist": ["..."], ` +
          `"claims": [{"text": "...", "sourceId": "<one of the span sourceIds>", "locator": "<that span's locator>"}]}`,
      },
    ],
  });

  const raw = parseJson<RawDraft>(textOf(msg));

  // Enforce grounding: drop any claim not bound to a provided span.
  const claims: Claim[] = (raw.claims ?? [])
    .filter((c) => c.sourceId && c.locator && validSourceIds.has(c.sourceId))
    .map((c) => ({ text: c.text, sourceId: c.sourceId, locator: c.locator, verified: false }));

  return {
    directAnswer: raw.directAnswer ?? "",
    sections: raw.sections ?? [],
    corridorDelta: raw.corridorDelta,
    checklist: raw.checklist ?? [],
    claims,
  };
}
