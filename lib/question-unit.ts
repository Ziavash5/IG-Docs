/**
 * The atomic question-unit — the core domain object of the Corridor Authority Engine.
 * The pipeline, the verifier, and the UI all speak this type. See
 * docs/question-unit-spec.md and schema/question-unit.schema.json.
 */

export type Corridor =
  | "base"
  | "germany"
  | "uk"
  | "usa"
  | "australia"
  | "newzealand"
  | "japan"
  | "india";

export type Layer = "base" | "overlay";

/**
 * factual    = source-verifiable; auto-ships when cited and dual-retrieval agrees.
 * interpretive = never asserted as a conclusion; framed as general information,
 *                routed to a booked call, always human-gated.
 */
export type RiskTier = "factual" | "interpretive";

export type UnitStatus = "draft" | "in_review" | "published";

/** Pillars 1–7: entry → operate → thrive. */
export type Pillar = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * A single factual assertion. The core safety rule: no source span, no claim.
 * Every claim binds to an official source (see docs/sources.md) and the locator of
 * the supporting span. `verified` flips true only after dual-retrieval verification
 * or explicit operator approval.
 */
export interface Claim {
  text: string;
  /** References a source_id in the official source registry (docs/sources.md). */
  sourceId: string;
  /** URL or precise locator of the supporting span. */
  locator: string;
  verified: boolean;
}

export interface Author {
  name: string;
  /** E-E-A-T requirement; mandatory before a unit may be published. */
  credentials: string;
}

export interface QuestionUnit {
  id: string;
  slug: string;
  /** The exact long-tail question this unit answers, at the passage level. */
  question: string;
  pillar: Pillar;
  layer: Layer;
  corridor: Corridor;
  /** ISO 3166-1 alpha-2 codes the unit touches, e.g. ["CA", "DE"]. */
  jurisdictions: string[];
  riskTier: RiskTier;
  status: UnitStatus;
  author?: Author;
  /** ISO date (YYYY-MM-DD). Mandatory, rendered visibly on the page. */
  lastReviewed: string;
  claims: Claim[];
  /** source_ids cited by this unit. Official sources only. */
  citations: string[];
  cta?: string;
  /** Rendered MDX/markdown body. */
  body?: string;
}

/**
 * Publish gate. A unit may go public only if it is structurally complete: a base-layer
 * unit must carry the base corridor, a bylined author with credentials is present, and
 * every claim has been verified. Returns the list of reasons it cannot publish (empty =
 * publishable).
 */
export function publishBlockers(unit: QuestionUnit): string[] {
  const reasons: string[] = [];

  if (unit.layer === "base" && unit.corridor !== "base") {
    reasons.push("Base-layer unit must use the 'base' corridor.");
  }
  if (!unit.author?.name) reasons.push("Missing author byline.");
  if (!unit.author?.credentials) reasons.push("Missing author credentials (E-E-A-T).");
  if (!unit.lastReviewed) reasons.push("Missing last-reviewed date.");
  if (unit.claims.length === 0) reasons.push("Unit has no claims.");
  if (unit.claims.some((c) => !c.verified)) {
    reasons.push("Every claim must be verified before publish.");
  }
  for (const c of unit.claims) {
    if (!c.sourceId || !c.locator) {
      reasons.push(`Claim has no source binding: "${c.text.slice(0, 60)}…"`);
    }
  }
  return reasons;
}

export const canPublish = (unit: QuestionUnit): boolean =>
  publishBlockers(unit).length === 0;
