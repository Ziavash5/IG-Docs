import postgres from "postgres";
import type { Source, Chunk, RetrievedSpan } from "./pipeline/types";
import type { TopicRow } from "./content";

/**
 * Postgres + pgvector access. The client is lazily created so `next build`
 * succeeds without DATABASE_URL — it's only needed at request time on the server.
 * `prepare: false` is required for Supabase's transaction pooler (PgBouncer).
 */
let _sql: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = postgres(url, { prepare: false });
  }
  return _sql;
}

const vec = (embedding: number[]) => `[${embedding.join(",")}]`;

export async function upsertSource(s: Source): Promise<void> {
  const db = sql();
  await db`
    insert into sources (id, body, url, corridor, last_checked)
    values (${s.id}, ${s.body}, ${s.url}, ${s.corridor}, now())
    on conflict (id) do update set
      body = excluded.body, url = excluded.url,
      corridor = excluded.corridor, last_checked = now()
  `;
}

export async function replaceChunks(
  sourceId: string,
  chunks: { text: string; locator: string; embedding: number[] }[],
): Promise<number> {
  const db = sql();
  await db`delete from chunks where source_id = ${sourceId}`;
  for (const c of chunks) {
    await db`
      insert into chunks (source_id, text, locator, embedding)
      values (${sourceId}, ${c.text}, ${c.locator}, ${vec(c.embedding)}::vector)
    `;
  }
  return chunks.length;
}

/** Append chunks for a source (used by resumable ingestion). */
export async function insertChunks(
  sourceId: string,
  chunks: { text: string; locator: string; embedding: number[] }[],
): Promise<void> {
  const db = sql();
  for (const c of chunks) {
    await db`
      insert into chunks (source_id, text, locator, embedding)
      values (${sourceId}, ${c.text}, ${c.locator}, ${vec(c.embedding)}::vector)
    `;
  }
}

/** Wipe a source's chunks and crawl frontier (for a fresh re-ingest). */
export async function clearSourceData(sourceId: string): Promise<void> {
  const db = sql();
  await db`delete from chunks where source_id = ${sourceId}`;
  await db`delete from ingest_queue where source_id = ${sourceId}`;
}

export async function queueCounts(sourceId: string): Promise<{ pending: number; done: number }> {
  const db = sql();
  const [p] = await db`select count(*)::int n from ingest_queue where source_id = ${sourceId} and status = 'pending'`;
  const [d] = await db`select count(*)::int n from ingest_queue where source_id = ${sourceId} and status = 'done'`;
  return { pending: Number(p.n), done: Number(d.n) };
}

export async function seedIngestQueue(sourceId: string, urls: string[]): Promise<void> {
  const db = sql();
  for (const url of urls) {
    await db`insert into ingest_queue (source_id, url) values (${sourceId}, ${url}) on conflict (source_id, url) do nothing`;
  }
}

export async function nextPending(sourceId: string, limit: number): Promise<{ id: string; url: string }[]> {
  const db = sql();
  const rows = await db`
    select id, url from ingest_queue where source_id = ${sourceId} and status = 'pending'
    order by id limit ${limit}
  `;
  return rows.map((r) => ({ id: String(r.id), url: r.url as string }));
}

export async function markQueueDone(id: string): Promise<void> {
  const db = sql();
  await db`update ingest_queue set status = 'done' where id = ${id}`;
}

/** Add newly-discovered URLs to the frontier, capped at maxTotal pages for the source. */
export async function addPending(sourceId: string, urls: string[], maxTotal: number): Promise<void> {
  const db = sql();
  const [t] = await db`select count(*)::int n from ingest_queue where source_id = ${sourceId}`;
  let total = Number(t.n);
  for (const url of urls) {
    if (total >= maxTotal) break;
    const r = await db`insert into ingest_queue (source_id, url) values (${sourceId}, ${url}) on conflict (source_id, url) do nothing`;
    total += r.count;
  }
}

// ---- Custom sources ---------------------------------------------------------

export async function listCustomSources(): Promise<Source[]> {
  const db = sql();
  const rows = await db`select id, body, url, corridor, crawl_prefix, crawl_max from custom_sources order by created_at`;
  return rows.map((r) => ({
    id: r.id as string,
    body: r.body as string,
    url: r.url as string,
    corridor: r.corridor as Source["corridor"],
    crawl: r.crawl_prefix ? { prefix: r.crawl_prefix as string, max: Number(r.crawl_max) || 15 } : undefined,
  }));
}

export async function insertCustomSource(s: {
  id: string; body: string; url: string; corridor: string; crawlPrefix?: string; crawlMax?: number;
}): Promise<void> {
  const db = sql();
  await db`
    insert into custom_sources (id, body, url, corridor, crawl_prefix, crawl_max)
    values (${s.id}, ${s.body}, ${s.url}, ${s.corridor}, ${s.crawlPrefix ?? null}, ${s.crawlMax ?? null})
    on conflict (id) do update set body = excluded.body, url = excluded.url,
      corridor = excluded.corridor, crawl_prefix = excluded.crawl_prefix, crawl_max = excluded.crawl_max
  `;
}

export async function deleteCustomSource(id: string): Promise<void> {
  const db = sql();
  await db`delete from custom_sources where id = ${id}`;
  await clearSourceData(id);
}

/** Cosine-similarity search over the chunks of the given sources. */
export async function searchChunks(
  queryEmbedding: number[],
  sourceIds: string[],
  k = 8,
): Promise<RetrievedSpan[]> {
  if (sourceIds.length === 0) return [];
  const db = sql();
  const rows = await db`
    select id, source_id, text, locator,
           1 - (embedding <=> ${vec(queryEmbedding)}::vector) as score
    from chunks
    where source_id in ${db(sourceIds)} and embedding is not null
    order by embedding <=> ${vec(queryEmbedding)}::vector
    limit ${k}
  `;
  return rows.map((r) => ({
    chunk: {
      id: String(r.id),
      sourceId: r.source_id as string,
      text: r.text as string,
      locator: r.locator as string,
    } as Chunk,
    score: Number(r.score),
  }));
}

export interface StoredUnitInput {
  id: string;
  slug: string;
  question: string;
  pillar: number;
  layer: "base" | "overlay";
  corridor: string;
  jurisdictions: string[];
  riskTier: "factual" | "interpretive";
  status: "draft" | "in_review" | "published";
  lastReviewed: string;
  cta?: string;
  body?: string;
  claims: { text: string; sourceId: string; locator: string; verified: boolean }[];
  citations: string[];
  queueReason?: string;
}

export async function storeUnit(u: StoredUnitInput): Promise<void> {
  const db = sql();
  await db`
    insert into units (id, slug, question, pillar, layer, corridor, jurisdictions,
                       risk_tier, status, last_reviewed, cta, body, updated_at)
    values (${u.id}, ${u.slug}, ${u.question}, ${u.pillar}, ${u.layer}, ${u.corridor},
            ${db.array(u.jurisdictions)}, ${u.riskTier}, ${u.status}, ${u.lastReviewed},
            ${u.cta ?? null}, ${u.body ?? null}, now())
    on conflict (id) do update set
      question = excluded.question, status = excluded.status,
      body = excluded.body, last_reviewed = excluded.last_reviewed, updated_at = now()
  `;
  await db`delete from claims where unit_id = ${u.id}`;
  for (const c of u.claims) {
    await db`
      insert into claims (unit_id, text, source_id, locator, verified)
      values (${u.id}, ${c.text}, ${c.sourceId}, ${c.locator}, ${c.verified})
    `;
  }
  // Regenerating replaces any prior open review entry, instead of stacking duplicates.
  await db`update review_queue set resolved_at = now() where unit_id = ${u.id} and resolved_at is null`;
  if (u.queueReason) {
    await db`insert into review_queue (unit_id, reason) values (${u.id}, ${u.queueReason})`;
  }
}

export interface QueueRow {
  queueId: string;
  unitId: string;
  slug: string;
  question: string;
  riskTier: string;
  reason: string;
  createdAt: string;
  body: string | null;
  claims: { text: string; sourceId: string; locator: string; verified: boolean }[];
}

export async function openQueue(): Promise<QueueRow[]> {
  const db = sql();
  const rows = await db`
    select q.id as queue_id, q.unit_id, q.reason, q.created_at,
           u.slug, u.question, u.risk_tier, u.body
    from review_queue q join units u on u.id = q.unit_id
    where q.resolved_at is null
    order by q.created_at desc
  `;
  const out: QueueRow[] = [];
  for (const r of rows) {
    const claims = await db`
      select text, source_id, locator, verified from claims where unit_id = ${r.unit_id}
    `;
    out.push({
      queueId: String(r.queue_id),
      unitId: r.unit_id as string,
      slug: r.slug as string,
      question: r.question as string,
      riskTier: r.risk_tier as string,
      reason: r.reason as string,
      createdAt: String(r.created_at),
      body: (r.body as string) ?? null,
      claims: claims.map((c) => ({
        text: c.text as string,
        sourceId: c.source_id as string,
        locator: c.locator as string,
        verified: c.verified as boolean,
      })),
    });
  }
  return out;
}

/** Operator approval: verify all claims, publish the unit, resolve the queue entry. */
export async function approveUnit(unitId: string): Promise<void> {
  const db = sql();
  await db`update claims set verified = true where unit_id = ${unitId}`;
  await db`update units set status = 'published', updated_at = now() where id = ${unitId}`;
  await db`update review_queue set resolved_at = now() where unit_id = ${unitId} and resolved_at is null`;
}

export async function ingestStats(): Promise<{ sources: number; chunks: number }> {
  const db = sql();
  const [s] = await db`select count(*)::int as n from sources`;
  const [c] = await db`select count(*)::int as n from chunks`;
  return { sources: Number(s.n), chunks: Number(c.n) };
}

// ---- Curriculum (editable topics) -------------------------------------------

export async function listTopics(): Promise<TopicRow[]> {
  const db = sql();
  const rows = await db`
    select id, stage, pillar_slug, slug, title, question, risk_tier, position
    from topics order by pillar_slug, position
  `;
  return rows.map((r) => ({
    id: r.id as string,
    stage: r.stage as string,
    pillarSlug: r.pillar_slug as string,
    slug: r.slug as string,
    title: r.title as string,
    question: r.question as string,
    riskTier: r.risk_tier as TopicRow["riskTier"],
    position: Number(r.position),
  }));
}

export async function insertTopic(t: TopicRow): Promise<void> {
  const db = sql();
  await db`
    insert into topics (id, stage, pillar_slug, slug, title, question, risk_tier, position)
    values (${t.id}, ${t.stage}, ${t.pillarSlug}, ${t.slug}, ${t.title}, ${t.question},
            ${t.riskTier}, ${t.position})
    on conflict (id) do nothing
  `;
}

export async function updateTopic(
  id: string,
  fields: { title: string; question: string; riskTier: string },
): Promise<void> {
  const db = sql();
  await db`
    update topics set title = ${fields.title}, question = ${fields.question},
      risk_tier = ${fields.riskTier} where id = ${id}
  `;
}

export async function deleteTopic(id: string): Promise<void> {
  const db = sql();
  await db`delete from topics where id = ${id}`;
}

/** Persist an explicit order for a set of topic ids (position = index). */
export async function reorderTopics(orderedIds: string[]): Promise<void> {
  const db = sql();
  for (let i = 0; i < orderedIds.length; i++) {
    await db`update topics set position = ${i} where id = ${orderedIds[i]}`;
  }
}

export async function topicCount(): Promise<number> {
  const db = sql();
  const [r] = await db`select count(*)::int as n from topics`;
  return Number(r.n);
}

/** unit status keyed by slug, so the curriculum can show what's been generated. */
export async function unitStatusBySlug(): Promise<Record<string, string>> {
  const db = sql();
  const rows = await db`select slug, status from units`;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.slug as string] = r.status as string;
  return out;
}

export interface PublicUnit {
  question: string;
  body: string | null;
  status: string;
  lastReviewed: string | null;
  citations: string[];
  claims: { text: string; sourceId: string; locator: string; verified: boolean }[];
}

/** Generated content for a slug, for public rendering. */
export async function getUnitContent(slug: string): Promise<PublicUnit | null> {
  const db = sql();
  const [u] = await db`
    select question, body, status, last_reviewed from units where slug = ${slug} limit 1
  `;
  if (!u) return null;
  const claims = await db`
    select text, source_id, locator, verified from claims
    where unit_id = (select id from units where slug = ${slug} limit 1)
  `;
  return {
    question: u.question as string,
    body: (u.body as string) ?? null,
    status: u.status as string,
    lastReviewed: u.last_reviewed ? String(u.last_reviewed).slice(0, 10) : null,
    citations: [...new Set(claims.map((c) => c.source_id as string))],
    claims: claims.map((c) => ({
      text: c.text as string,
      sourceId: c.source_id as string,
      locator: c.locator as string,
      verified: c.verified as boolean,
    })),
  };
}

export async function saveUnitBody(slug: string, body: string): Promise<void> {
  const db = sql();
  await db`update units set body = ${body}, updated_at = now() where slug = ${slug}`;
}

/** Passage count per source id, for showing ingest status in the console. */
export async function sourceChunkCounts(): Promise<Record<string, number>> {
  const db = sql();
  const rows = await db`select source_id, count(*)::int as n from chunks group by source_id`;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source_id as string] = Number(r.n);
  return out;
}
