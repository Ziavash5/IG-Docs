import type { QuestionUnit } from "../question-unit";
import type { ClaimVerification } from "./types";

/**
 * Fact-checker — dual-retrieval verification. For each claim: (1) confirm the cited
 * source span actually supports it, and (2) run an INDEPENDENT second retrieval over the
 * corpus. Claims that are cited and survive two agreeing passes are ship-eligible;
 * disagreements escalate to the operator's approval queue.
 *
 * NOT YET WIRED: requires Claude (entailment check) + pgvector (independent retrieval).
 */

export interface VerifyResult {
  unitId: string;
  claims: ClaimVerification[];
  /** True only if every claim's outcome is "agree". */
  allAgree: boolean;
  /** Interpretive units always route to the operator regardless of agreement. */
  requiresOperator: boolean;
}

export async function verifyUnit(_unit: QuestionUnit): Promise<VerifyResult> {
  throw new Error("not implemented: verifyUnit (needs Claude + pgvector)");
}

/**
 * Routing decision after verification, encoding tiered autonomy:
 *  - interpretive            → always operator
 *  - factual + allAgree      → auto-ship
 *  - factual + disagreement  → operator
 */
export function route(unit: QuestionUnit, result: VerifyResult): "auto-ship" | "operator" {
  if (unit.riskTier === "interpretive") return "operator";
  return result.allAgree ? "auto-ship" : "operator";
}
