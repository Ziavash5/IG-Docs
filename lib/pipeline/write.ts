import type { QuestionUnit, Corridor, Pillar } from "../question-unit";
import type { RetrievedSpan } from "./types";

/**
 * Writer — drafts a question-unit from retrieved spans. The hard constraint: every
 * factual claim must bind to a retrieved span. If the model asserts something no span
 * supports, that claim is DROPPED, not published. This is what removes the
 * hallucination class on the factual tier.
 *
 * Interpretive material is never written as a conclusion — it is framed as general
 * information with a routed-to-a-call handoff.
 *
 * NOT YET WIRED: requires Claude API key.
 */

export interface WriteRequest {
  question: string;
  corridor: Corridor;
  pillar: Pillar;
  spans: RetrievedSpan[];
}

/**
 * Draft a unit. Returned claims are only those grounded in a provided span; ungrounded
 * assertions are discarded before return. The result is `status: "draft"` with
 * unverified claims — it must pass `verify` before it can ship.
 */
export async function writeUnit(_req: WriteRequest): Promise<QuestionUnit> {
  throw new Error("not implemented: writeUnit (needs Claude API key)");
}
