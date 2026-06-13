import type { Corridor } from "../question-unit";
import type { RetrievedSpan } from "./types";

/**
 * Corridor-aware retrieval. Given a question and a corridor, decide which official
 * sources matter for THIS corridor (e.g. a German question pulls Handelsregister + BZSt
 * + the Canada–Germany treaty), then retrieve the supporting spans from pgvector.
 *
 * This is what lets one operator scale: add sources, and the system figures out when a
 * corridor question needs them.
 *
 * NOT YET WIRED: requires Claude (source selection) + pgvector (vector search).
 */

/** Claude selects the relevant source_ids for a question in a given corridor. */
export async function selectSources(
  _question: string,
  _corridor: Corridor,
): Promise<string[]> {
  throw new Error("not implemented: selectSources (needs Claude API key)");
}

/** Vector-search the chunks of the selected sources for spans answering the question. */
export async function retrieveSpans(
  _question: string,
  _sourceIds: string[],
  _k = 8,
): Promise<RetrievedSpan[]> {
  throw new Error("not implemented: retrieveSpans (needs pgvector)");
}
