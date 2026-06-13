import type { Source, Chunk } from "./types";
import { embedDocuments } from "../voyage";
import { upsertSource, replaceChunks } from "../db";
import { SOURCE_REGISTRY } from "../sources-registry";

/**
 * Ingestion — fetch official sources, chunk, embed (Voyage), upsert to pgvector with
 * citation metadata. Runs server-side (admin-triggered). Keep the source set small per
 * run to stay within serverless time limits.
 */

export interface IngestResult {
  sourceId: string;
  chunks: number;
}

/** Fetch an official source and reduce HTML to readable text. */
export async function fetchSource(source: Source): Promise<string> {
  const res = await fetch(source.url, {
    headers: { "user-agent": "InterGestCanada-Ingest/0.1 (+corridor-authority-engine)" },
  });
  if (!res.ok) throw new Error(`Fetch ${source.id} failed: ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split source text into passage-level chunks (~1200 chars) for retrieval. */
export function chunk(source: Source, text: string): Chunk[] {
  const target = 1200;
  const out: Chunk[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let buf = "";
  let n = 0;
  const flush = () => {
    const t = buf.trim();
    if (t.length > 80) {
      out.push({ id: `${source.id}-${n++}`, sourceId: source.id, text: t, locator: source.url });
    }
    buf = "";
  };
  for (const s of sentences) {
    if ((buf + " " + s).length > target) flush();
    buf += " " + s;
  }
  flush();
  return out;
}

/** Full ingest for one source: fetch → chunk → embed → store. */
export async function ingestSource(source: Source): Promise<IngestResult> {
  await upsertSource(source);
  const text = await fetchSource(source);
  const chunks = chunk(source, text);
  if (chunks.length === 0) return { sourceId: source.id, chunks: 0 };
  const embeddings = await embedDocuments(chunks.map((c) => c.text));
  const stored = await replaceChunks(
    source.id,
    chunks.map((c, i) => ({ text: c.text, locator: c.locator, embedding: embeddings[i] })),
  );
  return { sourceId: source.id, chunks: stored };
}

/** Ingest the whole registry (or a corridor subset). */
export async function ingestAll(sources: Source[] = SOURCE_REGISTRY): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const s of sources) {
    try {
      results.push(await ingestSource(s));
    } catch (e) {
      results.push({ sourceId: s.id, chunks: 0 });
      console.error(`Ingest failed for ${s.id}:`, e);
    }
  }
  return results;
}
