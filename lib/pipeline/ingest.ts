import type { Source, Chunk } from "./types";
import { embedDocuments } from "../voyage";
import { upsertSource, replaceChunks } from "../db";
import { SOURCE_REGISTRY } from "../sources-registry";

/**
 * Ingestion — fetch official sources DEEPLY (landing page plus sub-pages), reduce each
 * page to its main text, chunk, embed (Voyage), and upsert to pgvector. Each passage's
 * locator is the exact page it came from, so citations point at the right sub-page.
 */

const MAX_CHUNKS_PER_SOURCE = 600;
const CHUNK_TARGET = 1200;
const UA = "InterGestCanada-Ingest/0.2 (+corridor-authority-engine)";

export interface IngestResult {
  sourceId: string;
  chunks: number;
  pages: number;
}

/** Reduce HTML to readable text, preferring the <main> content region when present. */
function extractText(html: string): string {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  return main
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same-origin links under `prefix`, for crawling a topic tree. */
function extractLinks(html: string, baseUrl: string, prefix: string): string[] {
  const out = new Set<string>();
  const re = /href\s*=\s*["']([^"'#]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], baseUrl).toString().split("#")[0];
      if (u.startsWith(prefix)) out.add(u);
    } catch {
      /* skip malformed */
    }
  }
  return [...out];
}

/** Fetch the seed pages plus (if configured) crawled sub-pages. */
async function collectPages(source: Source): Promise<{ url: string; text: string }[]> {
  const seeds = source.urls?.length ? [source.url, ...source.urls] : [source.url];
  const max = source.crawl?.max ?? seeds.length;
  const visited = new Set<string>();
  const queue = [...new Set(seeds)];
  const pages: { url: string; text: string }[] = [];

  while (queue.length && pages.length < max) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    let html: string;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }
    const text = extractText(html);
    if (text.length > 200) pages.push({ url, text });
    if (source.crawl) {
      for (const link of extractLinks(html, url, source.crawl.prefix)) {
        if (!visited.has(link) && queue.length + pages.length < max) queue.push(link);
      }
    }
  }
  return pages;
}

/** Split one page into passage-level chunks, each citing that page. */
function chunkPage(sourceId: string, url: string, text: string, startIdx: number): Chunk[] {
  const out: Chunk[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let buf = "";
  let n = startIdx;
  const flush = () => {
    const t = buf.trim();
    if (t.length > 80) out.push({ id: `${sourceId}-${n++}`, sourceId, text: t, locator: url });
    buf = "";
  };
  for (const s of sentences) {
    if ((buf + " " + s).length > CHUNK_TARGET) flush();
    buf += " " + s;
  }
  flush();
  return out;
}

/** Full ingest for one source: crawl → chunk → embed → store. */
export async function ingestSource(source: Source): Promise<IngestResult> {
  await upsertSource(source);
  const pages = await collectPages(source);

  let chunks: Chunk[] = [];
  for (const p of pages) {
    chunks = chunks.concat(chunkPage(source.id, p.url, p.text, chunks.length));
    if (chunks.length >= MAX_CHUNKS_PER_SOURCE) break;
  }
  chunks = chunks.slice(0, MAX_CHUNKS_PER_SOURCE);
  if (chunks.length === 0) return { sourceId: source.id, chunks: 0, pages: pages.length };

  const embeddings = await embedDocuments(chunks.map((c) => c.text));
  const stored = await replaceChunks(
    source.id,
    chunks.map((c, i) => ({ text: c.text, locator: c.locator, embedding: embeddings[i] })),
  );
  return { sourceId: source.id, chunks: stored, pages: pages.length };
}

/** Ingest the whole registry (or a subset). */
export async function ingestAll(sources: Source[] = SOURCE_REGISTRY): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const s of sources) {
    try {
      results.push(await ingestSource(s));
    } catch (e) {
      results.push({ sourceId: s.id, chunks: 0, pages: 0 });
      console.error(`Ingest failed for ${s.id}:`, e);
    }
  }
  return results;
}
