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
// Present as a real browser; bare bot UAs get blocked by canada.ca's bot manager.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-CA,en;q=0.9,de;q=0.8",
};

export interface IngestResult {
  sourceId: string;
  chunks: number;
  pages: number;
}

function clean(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reduce HTML to readable text, preferring <main>, falling back to the full body. */
function extractText(html: string): string {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0];
  if (main) {
    const t = clean(main);
    if (t.length >= 400) return t;
  }
  return clean(html);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a hard timeout so a slow/hanging page can't stall the whole step. */
async function timedFetch(url: string, headers: Record<string, string>, ms = 25000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Absolute links found in raw HTML. */
function htmlLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /href\s*=\s*["']([^"'#]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.add(new URL(m[1], baseUrl).toString().split("#")[0]);
    } catch {
      /* skip */
    }
  }
  return [...out];
}

/** Absolute links found in reader markdown. */
function markdownLinks(md: string): string[] {
  const out = new Set<string>();
  const re = /\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) out.add(m[1].split("#")[0]);
  return [...out];
}

/**
 * Clean reader markdown into prose: drop the reader header and the trailing
 * "Links/Buttons"/"Images" summary, collapse markdown links to their text, and remove
 * image/link-list noise — so chunks are real content, not navigation.
 */
function cleanReaderText(md: string): string {
  let t = md;
  const contentIdx = t.indexOf("Markdown Content:");
  if (contentIdx !== -1) t = t.slice(contentIdx + "Markdown Content:".length);
  t = t.split(/\n(?:Links\/Buttons|Images):\s*\n/i)[0];
  return t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1") // links -> text
    .replace(/^\s*[*-]\s+$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fast path: a direct browser-like fetch. Returns null if blocked or thin. */
async function fetchDirect(url: string): Promise<{ text: string; links: string[] } | null> {
  try {
    const res = await timedFetch(url, FETCH_HEADERS);
    if (!res.ok) return null;
    const html = await res.text();
    const text = extractText(html);
    if (text.length < 300) return null;
    return { text, links: htmlLinks(html, url) };
  } catch {
    return null;
  }
}

/**
 * Robust path: Jina Reader renders the page (JS + bot-managed sites) and returns clean
 * content. Free anonymously; set JINA_API_KEY for higher limits. Retries on rate limits.
 */
async function fetchReader(
  url: string,
  attempt = 0,
): Promise<{ text: string; links: string[] } | null> {
  const key = process.env.JINA_API_KEY;
  const headers: Record<string, string> = {
    accept: "text/plain",
    "x-with-links-summary": "true",
  };
  if (key) headers.authorization = `Bearer ${key}`;
  try {
    const res = await timedFetch(`https://r.jina.ai/${url}`, headers, 30000);
    if (res.status === 429 && attempt < 4) {
      await sleep(2 ** attempt * 3000);
      return fetchReader(url, attempt + 1);
    }
    if (!res.ok) return null;
    const md = await res.text();
    if (md.length < 200) return null;
    // Links come from the full markdown (incl. the summary); content is cleaned prose.
    return { text: cleanReaderText(md), links: markdownLinks(md) };
  } catch {
    return null;
  }
}

/** Fetch one page robustly: direct first, then the rendering reader. PDFs go via the
 *  reader (it extracts PDF text; a direct fetch returns unreadable binary). */
export async function fetchPage(url: string): Promise<{ text: string; links: string[] } | null> {
  if (/\.pdf($|\?)/i.test(url)) return await fetchReader(url);
  return (await fetchDirect(url)) ?? (await fetchReader(url));
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
    const page = await fetchPage(url);
    if (!page) continue;
    if (page.text.length > 200) pages.push({ url, text: page.text });
    if (source.crawl) {
      for (const link of page.links) {
        if (link.startsWith(source.crawl.prefix) && !visited.has(link) &&
            queue.length + pages.length < max) {
          queue.push(link);
        }
      }
    }
    await sleep(300);
  }
  return pages;
}

/** Split one page into passage-level chunks, each citing that page. */
export function chunkPage(sourceId: string, url: string, text: string, startIdx = 0): Chunk[] {
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
