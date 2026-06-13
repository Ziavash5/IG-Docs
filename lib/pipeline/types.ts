/**
 * Shared types for the generation pipeline. The pipeline turns official sources into
 * verified question-units with the human kept out of the low-risk majority.
 */

/** A registered official source (see docs/sources.md). Official bodies only. */
export interface Source {
  id: string;
  body: string;
  /** Primary landing page. */
  url: string;
  corridor: import("../question-unit").Corridor;
  /** Extra seed pages to ingest in addition to `url` (e.g. a statute's full text). */
  urls?: string[];
  /** Follow links under `prefix` (same origin) up to `max` pages, for deep coverage. */
  crawl?: { prefix: string; max: number };
  /** Last time the freshness loop confirmed this source unchanged. */
  lastChecked?: string;
}

/** A chunk of an ingested source, with its embedding, stored in pgvector. */
export interface Chunk {
  id: string;
  sourceId: string;
  text: string;
  /** Locator (URL + anchor/section) for citation back to the official source. */
  locator: string;
  embedding?: number[];
}

/** A retrieved span the writer may cite. */
export interface RetrievedSpan {
  chunk: Chunk;
  score: number;
}

/** Result of verifying one claim against its citation + an independent retrieval. */
export interface ClaimVerification {
  claimText: string;
  citationSupports: boolean;
  /** Independent second-pass retrieval agreed with the claim. */
  secondPassAgrees: boolean;
  /** agree = ship-eligible; disagree = escalate to the operator. */
  outcome: "agree" | "disagree";
  notes?: string;
}
