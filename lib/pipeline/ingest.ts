import type { Source, Chunk } from "./types";

/**
 * Ingestion — fetch official sources, chunk, embed (Voyage), and upsert to pgvector
 * with full citation metadata. Scheduled; scales as the operator registers more
 * sources. No source is ingested unless it is in the official registry (docs/sources.md).
 *
 * NOT YET WIRED: requires Voyage + Postgres credentials. Interfaces are fixed so the
 * rest of the pipeline can be built against them.
 */

export interface IngestResult {
  sourceId: string;
  chunks: number;
  skipped: number;
}

/** Fetch the raw text of an official source (gov page / primary legislation / registry). */
export async function fetchSource(_source: Source): Promise<string> {
  throw new Error("not implemented: fetchSource (needs network + source adapters)");
}

/** Split source text into passage-level chunks suitable for retrieval. */
export function chunk(_sourceId: string, _text: string): Chunk[] {
  throw new Error("not implemented: chunk");
}

/** Embed chunks with Voyage and upsert into pgvector. */
export async function embedAndStore(_chunks: Chunk[]): Promise<number> {
  throw new Error("not implemented: embedAndStore (needs Voyage + pgvector)");
}

/** Full ingest for one source: fetch → chunk → embed → store. */
export async function ingestSource(_source: Source): Promise<IngestResult> {
  throw new Error("not implemented: ingestSource");
}
