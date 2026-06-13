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
      "You write atomic question-units for InterGest Canada, helping foreign companies " +
      "set up and operate in Canada. RULES: (1) Answer the exact question in the " +
      "directAnswer (1–3 sentences). (2) Every claim in claims[] MUST be supported by one " +
      "of the provided spans and cite that span's sourceId and locator — never invent a " +
      "source or assert anything a span does not support. (3) For interpretive matters " +
      "(treaty application, permanent establishment, transfer pricing, immigration " +
      "eligibility) do NOT state a conclusion; frame as general information and defer to a " +
      "call. (4) corridorDelta explains how the answer differs for the source country. " +
      "Respond with a single JSON object only.",
    messages: [
      {
        role: "user",
        content:
          `Question: ${req.question}\nCorridor: ${req.corridor}\nPillar: ${req.pillar}\n` +
          `Risk tier: ${req.riskTier}\n\nRetrieved official source spans:\n${spanList}\n\n` +
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
