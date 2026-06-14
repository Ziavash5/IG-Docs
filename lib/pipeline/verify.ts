import type { Claim } from "../question-unit";
import type { ClaimVerification } from "./types";
import { jsonCall } from "../anthropic";
import { embedQuery } from "../voyage";
import { searchChunks } from "../db";

/**
 * Fact-checker — dual-retrieval verification. For each claim: (1) an independent
 * retrieval pass over the corpus, and (2) a Claude entailment check asking whether the
 * retrieved spans actually support the claim. Claims that pass are ship-eligible;
 * disagreements escalate to the operator. Interpretive units always route to the operator.
 */

export interface VerifyResult {
  claims: ClaimVerification[];
  allAgree: boolean;
  requiresOperator: boolean;
}

interface RawVerification {
  results: { index: number; citationSupports: boolean; secondPassAgrees: boolean; notes?: string }[];
}

export async function verifyClaims(
  claims: Claim[],
  sourceIds: string[],
  riskTier: "factual" | "interpretive",
): Promise<VerifyResult> {
  if (claims.length === 0) {
    return { claims: [], allAgree: false, requiresOperator: true };
  }

  // Independent second-pass retrieval per claim.
  const passages: string[] = [];
  for (let i = 0; i < claims.length; i++) {
    const spans = await searchChunks(await embedQuery(claims[i].text), sourceIds, 4);
    passages.push(
      `Claim ${i}: ${claims[i].text}\nCited source: ${claims[i].sourceId} (${claims[i].locator})\n` +
        `Independently retrieved spans:\n` +
        (spans.map((s) => `- [${s.chunk.sourceId}] ${s.chunk.text.slice(0, 500)}`).join("\n") ||
          "(none found)"),
    );
  }

  const raw = await jsonCall<RawVerification>({
    maxTokens: 4000,
    schema: {
      type: "object", additionalProperties: false, required: ["results"],
      properties: {
        results: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            required: ["index", "citationSupports", "secondPassAgrees", "notes"],
            properties: {
              index: { type: "integer" }, citationSupports: { type: "boolean" },
              secondPassAgrees: { type: "boolean" }, notes: { type: "string" },
            },
          },
        },
      },
    },
    system:
      "You are a fact-checker verifying claims against official sources. For each claim " +
      "decide: citationSupports = do the retrieved spans from the cited source support the " +
      "claim? secondPassAgrees = does the independent evidence agree? Be strict: if the " +
      "evidence is absent or only partial, answer false. One result per claim.",
    user: passages.join("\n\n"),
  });
  const byIndex = new Map(raw.results.map((r) => [r.index, r]));

  const verifications: ClaimVerification[] = claims.map((c, i) => {
    const r = byIndex.get(i);
    const citationSupports = r?.citationSupports ?? false;
    const secondPassAgrees = r?.secondPassAgrees ?? false;
    const agree = citationSupports && secondPassAgrees;
    return {
      claimText: c.text,
      citationSupports,
      secondPassAgrees,
      outcome: agree ? "agree" : "disagree",
      notes: r?.notes,
    };
  });

  const allAgree = verifications.every((v) => v.outcome === "agree");
  return { claims: verifications, allAgree, requiresOperator: riskTier === "interpretive" || !allAgree };
}

/** Routing decision encoding tiered autonomy. */
export function route(
  riskTier: "factual" | "interpretive",
  result: VerifyResult,
): "auto-ship" | "operator" {
  if (riskTier === "interpretive") return "operator";
  return result.allAgree ? "auto-ship" : "operator";
}
