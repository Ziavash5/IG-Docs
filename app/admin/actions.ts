"use server";

import { revalidatePath } from "next/cache";
import { pillarBySlug } from "@/lib/content";
import { selectSources, retrieveSpans } from "@/lib/pipeline/retrieve";
import { writeUnit } from "@/lib/pipeline/write";
import { verifyClaims, route } from "@/lib/pipeline/verify";
import { fetchPage, chunkPage } from "@/lib/pipeline/ingest";
import { embedDocuments, embedQuery } from "@/lib/voyage";
import { allSources } from "@/lib/sources-registry";
import {
  storeUnit,
  approveUnit as dbApprove,
  listTopics,
  insertTopic,
  updateTopic,
  deleteTopic,
  reorderTopics,
  unitStatusBySlug,
  saveUnitBody as dbSaveBody,
  getUnitContent,
  upsertSource,
  insertChunks,
  clearSourceData,
  queueCounts,
  allQueueCounts,
  sourceChunkCounts,
  searchChunks,
  browseChunks,
  seedIngestQueue,
  nextPending,
  markQueueDone,
  addPending,
  insertCustomSource,
  deleteCustomSource,
  deleteUnit,
  insertCorridor,
  deleteCorridor,
  setSetting,
  publishQuestionAnswer,
  deleteQuestion,
  deleteUnitFor,
  deleteTopicsForCorridor,
} from "@/lib/db";
import { runFreshnessCheck } from "@/lib/freshness";
import { getActiveCorridor, allCorridors } from "@/lib/corridor";
import { cookies } from "next/headers";
import { anthropic, MODEL, textOf, jsonCall } from "@/lib/anthropic";
import {
  seedDefaults,
  recoverContent,
  suggestTopics,
  autoOrderSlugs,
  assessCurriculum,
  assessUnitValue,
  type SuggestedTopic,
} from "@/lib/curriculum";

/** Human label for a corridor (for AI prompts), e.g. "germany" -> "Germany". */
async function corridorLabel(slug: string): Promise<string> {
  const c = (await allCorridors()).find((x) => x.slug === slug);
  return c?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}
import type { Corridor, RiskTier } from "@/lib/question-unit";

export type ActionResult = { ok: boolean; message: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ---- Curriculum authoring ---------------------------------------------------

export async function seedCurriculum(): Promise<ActionResult> {
  try {
    const corridor = await getActiveCorridor();
    const label = await corridorLabel(corridor);
    const n = await seedDefaults(corridor, label);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: `Seeded ${n} topics for ${label}.` };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Wipe the active corridor's topics so it can be re-seeded clean. Content/units are kept
    (use Recover content to bring them back). */
export async function clearCurriculum(): Promise<ActionResult> {
  try {
    const corridor = await getActiveCorridor();
    const n = await deleteTopicsForCorridor(corridor);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: `Cleared ${n} topic(s). Generated content is kept, click Recover content to restore it.` };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Rebuild this corridor's curriculum from its generated units (recovers orphaned content). */
export async function recoverCurriculum(): Promise<ActionResult> {
  try {
    const corridor = await getActiveCorridor();
    const n = await recoverContent(corridor);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: n > 0
        ? `Recovered ${n} topic(s) from existing content. Rename any that need a cleaner label.`
        : "Nothing to recover. Every unit already has a topic.",
    };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export async function addTopic(
  stage: string,
  pillarSlug: string,
  t: { title: string; question: string; riskTier: RiskTier },
): Promise<ActionResult> {
  if (!t.title.trim() || !t.question.trim()) return { ok: false, message: "Title and question are required." };
  try {
    const corridor = await getActiveCorridor();
    const slug = `${slugify(t.title)}-${Math.random().toString(36).slice(2, 6)}`;
    await insertTopic({
      id: `${corridor}-${slug}`,
      corridor,
      stage,
      pillarSlug,
      slug,
      title: t.title.trim(),
      question: t.question.trim(),
      riskTier: t.riskTier,
      position: Math.floor(Date.now() / 100000),
    });
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Added." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export async function editTopic(
  slug: string,
  t: { title: string; question: string; riskTier: RiskTier },
): Promise<ActionResult> {
  try {
    await updateTopic(await getActiveCorridor(), slug, { title: t.title, question: t.question, riskTier: t.riskTier });
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export async function removeTopic(slug: string): Promise<ActionResult> {
  try {
    const removed = await deleteTopic(await getActiveCorridor(), slug);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return removed > 0 ? { ok: true, message: "Removed." } : { ok: false, message: "Nothing to remove." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export async function suggest(
  pillarTitle: string,
  service: string,
  existing: string[],
): Promise<{ ok: boolean; message?: string; suggestions: SuggestedTopic[] }> {
  try {
    const label = await corridorLabel(await getActiveCorridor());
    const suggestions = await suggestTopics(pillarTitle, service, existing, label);
    return { ok: true, suggestions };
  } catch (e) {
    return { ok: false, message: errMsg(e), suggestions: [] };
  }
}

/** Persist a manual reorder (client passes the new slug order for one pillar). */
export async function reorder(orderedSlugs: string[]): Promise<ActionResult> {
  try {
    await reorderTopics(await getActiveCorridor(), orderedSlugs);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Reordered." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Let AI order a pillar's topics into a logical sequence. */
export async function autoOrder(pillarSlug: string, pillarTitle: string): Promise<ActionResult> {
  try {
    const corridor = await getActiveCorridor();
    const topics = (await listTopics(corridor)).filter((t) => t.pillarSlug === pillarSlug);
    const ordered = await autoOrderSlugs(pillarTitle, topics.map((t) => ({ slug: t.slug, question: t.question })));
    await reorderTopics(corridor, ordered);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Reordered by AI." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** AI quality review of a pillar's question set. */
export async function checkQuality(
  pillarTitle: string,
  service: string,
  questions: string[],
): Promise<{ ok: boolean; text?: string; message?: string }> {
  try {
    const label = await corridorLabel(await getActiveCorridor());
    return { ok: true, text: await assessCurriculum(pillarTitle, service, questions, label) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

const STEP_PAGES = 5;

export type StepResult = { ok: boolean; done: boolean; message: string };

/** Seed-if-fresh, then process one batch of pages for a source. */
async function processSourceBatch(
  source: import("@/lib/pipeline/types").Source,
): Promise<{ batch: number; added: number; complete: boolean }> {
  const counts = await queueCounts(source.id);
  if (counts.pending === 0 && counts.done === 0) {
    await clearSourceData(source.id);
    await upsertSource(source);
    const seeds = source.urls?.length ? [source.url, ...source.urls] : [source.url];
    await seedIngestQueue(source.id, [...new Set(seeds)]);
  } else if (counts.pending === 0) {
    return { batch: 0, added: 0, complete: true };
  }

  const max = source.crawl?.max ?? 3;
  const batch = await nextPending(source.id, STEP_PAGES);
  let added = 0;
  for (const item of batch) {
    const page = await fetchPage(item.url);
    await markQueueDone(item.id);
    if (!page || page.text.length < 200) continue;
    const chunks = chunkPage(source.id, item.url, page.text);
    if (chunks.length) {
      const emb = await embedDocuments(chunks.map((c) => c.text));
      await insertChunks(source.id, chunks.map((c, i) => ({ text: c.text, locator: c.locator, embedding: emb[i] })));
      added += chunks.length;
    }
    if (source.crawl) {
      await addPending(source.id, page.links.filter((l) => l.startsWith(source.crawl!.prefix)), max);
    }
  }
  const after = await queueCounts(source.id);
  return { batch: batch.length, added, complete: after.pending === 0 };
}

const needsWork = (c: { pending: number; done: number }, onlyInProgress = false) =>
  onlyInProgress ? c.pending > 0 : c.pending > 0 || (c.pending === 0 && c.done === 0);

/** Advance one source by a batch (for client-driven per-source / selected loops). */
export async function ingestSourceStep(sourceId: string): Promise<StepResult> {
  const source = (await allSources()).find((s) => s.id === sourceId);
  if (!source) return { ok: false, done: true, message: "Unknown source." };
  try {
    const r = await processSourceBatch(source);
    revalidatePath("/admin");
    return { ok: true, done: r.complete, message: `${sourceId}: +${r.added} passages${r.complete ? " (done)" : ""}` };
  } catch (e) {
    return { ok: false, done: true, message: errMsg(e) };
  }
}

export type SourceStatus = { id: string; passages: number; pending: number; done: number };

/** Live per-source ingestion status for the console (polled by the client). */
export async function corpusStatus(): Promise<SourceStatus[]> {
  try {
    const [counts, q, sources] = await Promise.all([sourceChunkCounts(), allQueueCounts(), allSources()]);
    return sources.map((s) => ({
      id: s.id,
      passages: counts[s.id] ?? 0,
      pending: q[s.id]?.pending ?? 0,
      done: q[s.id]?.done ?? 0,
    }));
  } catch {
    return [];
  }
}

export type Passage = { sourceId: string; locator: string; text: string; score?: number };

/** Semantic search across the corpus (optionally one source), for the explorer. */
export async function corpusSearch(query: string, sourceId?: string): Promise<Passage[]> {
  if (!query.trim()) return [];
  try {
    const emb = await embedQuery(query);
    const ids = sourceId ? [sourceId] : (await allSources()).map((s) => s.id);
    const spans = await searchChunks(emb, ids, 25);
    return spans.map((s) => ({ sourceId: s.chunk.sourceId, locator: s.chunk.locator, text: s.chunk.text, score: s.score }));
  } catch {
    return [];
  }
}

/** Browse one source's passages in order (paginated). */
export async function corpusBrowse(sourceId: string, offset = 0): Promise<Passage[]> {
  try {
    const rows = await browseChunks(sourceId, 25, offset);
    return rows.map((r) => ({ sourceId, locator: r.locator, text: r.text }));
  } catch {
    return [];
  }
}

/** Reset a source's corpus + frontier (so the next step starts it fresh). */
export async function clearSource(sourceId: string): Promise<ActionResult> {
  try {
    await clearSourceData(sourceId);
    revalidatePath("/admin");
    return { ok: true, message: "Reset." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/**
 * Resumable ingestion. Each call processes a small batch of pages so a deep source
 * ingests across several clicks without timing out. Click again while pages remain.
 */
export async function ingestStep(sourceId: string): Promise<ActionResult> {
  const source = (await allSources()).find((s) => s.id === sourceId);
  if (!source) return { ok: false, message: "Unknown source." };
  try {
    const r = await processSourceBatch(source);
    revalidatePath("/admin");
    return {
      ok: true,
      message: r.complete
        ? `Done. ${r.added > 0 ? `+${r.added} passages.` : ""}`.trim()
        : `Ingested ${r.batch} page(s), +${r.added} passages. Click Continue for the rest.`,
    };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/**
 * One batch across the whole corpus, for the client-driven loop. With
 * onlyInProgress, it resumes started-but-unfinished sources and skips fresh ones.
 */
export async function ingestAllStep(onlyInProgress = false): Promise<StepResult> {
  try {
    const sources = await allSources();
    for (const s of sources) {
      if (needsWork(await queueCounts(s.id), onlyInProgress)) {
        const r = await processSourceBatch(s);
        let remaining = false;
        for (const s2 of sources) {
          if (needsWork(await queueCounts(s2.id), onlyInProgress)) { remaining = true; break; }
        }
        revalidatePath("/admin");
        return { ok: true, done: !remaining, message: `${s.id}: +${r.added} passages${r.complete ? " (done)" : ""}.` };
      }
    }
    return { ok: true, done: true, message: onlyInProgress ? "Nothing unfinished." : "All sources ingested." };
  } catch (e) {
    return { ok: false, done: true, message: errMsg(e) };
  }
}

const AUTOPILOT_MIN_SCORE = 4;

/**
 * Autopilot: one unit of end-to-end work per call, looped by the client. It finishes
 * ingestion first, then generates each not-yet-generated topic, self-assesses it, and
 * auto-publishes only high-scoring FACTUAL units (interpretive always stays gated for a
 * human). Failures are parked in the queue so they are never retried forever.
 */
export async function autopilotStep(): Promise<StepResult> {
  try {
    // 1) Finish ingestion before writing anything.
    const sources = await allSources();
    for (const s of sources) {
      if (needsWork(await queueCounts(s.id))) {
        const r = await processSourceBatch(s);
        revalidatePath("/admin");
        return { ok: true, done: false, message: `Ingesting ${s.id} (+${r.added})…` };
      }
    }

    // 2) Generate the next topic that has no unit yet (for the active corridor).
    const CORRIDOR = await getActiveCorridor();
    const topics = await listTopics(CORRIDOR);
    const statuses = await unitStatusBySlug(CORRIDOR);
    const next = topics.find((t) => !statuses[t.slug] || statuses[t.slug] === "planned");
    if (!next) return { ok: true, done: true, message: "Autopilot complete." };

    await generateUnit(next.slug);
    const content = await getUnitContent(CORRIDOR, next.slug);
    if (!content) {
      // Generation produced nothing (sources missing): park it so it is not retried.
      await storeUnit({
        id: `${CORRIDOR}-${next.slug}`, slug: next.slug, question: next.question,
        pillar: pillarBySlug(next.pillarSlug)?.n ?? 1, layer: "overlay", corridor: CORRIDOR,
        jurisdictions: ["CA", "DE"], riskTier: next.riskTier, status: "draft",
        lastReviewed: new Date().toISOString().slice(0, 10), body: "", claims: [],
        citations: [], queueReason: "needs-sources",
      });
      revalidatePath("/admin");
      return { ok: true, done: false, message: `${next.slug}: needs sources (parked).` };
    }

    const v = await assessUnitValue(content.question, content.body ?? "", content.citations);
    let note = ` (value ${v.score}/5)`;
    if (content.status === "in_review" && next.riskTier === "factual" && v.score >= AUTOPILOT_MIN_SCORE) {
      await dbApprove(`${CORRIDOR}-${next.slug}`);
      note += " auto-published";
    }
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, done: false, message: `Generated ${next.slug}${note}` };
  } catch (e) {
    return { ok: false, done: true, message: errMsg(e) };
  }
}

/** Reset a source and start ingestion over. */
export async function ingestRestart(sourceId: string): Promise<ActionResult> {
  try {
    await clearSourceData(sourceId);
    revalidatePath("/admin");
    return await ingestStep(sourceId);
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

// ---- Custom sources ---------------------------------------------------------

const slugifyId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export async function addSource(input: {
  body: string; url: string; corridor: string; crawl: boolean;
}): Promise<ActionResult> {
  if (!input.body.trim() || !/^https?:\/\//.test(input.url.trim())) {
    return { ok: false, message: "Give a name and a valid http(s) URL." };
  }
  try {
    const id = `custom-${slugifyId(input.body)}-${Math.random().toString(36).slice(2, 5)}`;
    let crawlPrefix: string | undefined;
    if (input.crawl) {
      const u = new URL(input.url.trim());
      crawlPrefix = `${u.origin}${u.pathname.replace(/[^/]*$/, "")}`;
    }
    await insertCustomSource({
      id, body: input.body.trim(), url: input.url.trim(), corridor: input.corridor,
      crawlPrefix, crawlMax: input.crawl ? 20 : undefined,
    });
    revalidatePath("/admin");
    return { ok: true, message: "Source added. Click Ingest on it." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Upload a PDF, extract its text, and store it as a source with its passages. */
export async function addPdfSource(formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const corridor = String(formData.get("corridor") ?? "base");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a PDF." };
  if (!name) return { ok: false, message: "Give the document a name." };

  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean.length < 100) return { ok: false, message: "No extractable text (scanned/image PDF?)." };

    const id = `custom-pdf-${slugifyId(name)}-${Math.random().toString(36).slice(2, 5)}`;
    const locator = `uploaded:${file.name}`;
    await insertCustomSource({ id, body: `${name} (PDF)`, url: locator, corridor });
    await upsertSource({ id, body: `${name} (PDF)`, url: locator, corridor: corridor as Corridor });
    await clearSourceData(id);

    const chunks = chunkPage(id, locator, clean);
    const emb = await embedDocuments(chunks.map((c) => c.text));
    await insertChunks(id, chunks.map((c, i) => ({ text: c.text, locator: c.locator, embedding: emb[i] })));
    revalidatePath("/admin");
    return { ok: true, message: `Added “${name}” with ${chunks.length} passages.` };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** AI proposes official sources for a corridor (you verify by adding + ingesting). */
export async function discoverSources(
  corridor: string,
): Promise<{ ok: boolean; message?: string; sources: { body: string; url: string }[] }> {
  try {
    const existing = (await allSources()).map((s) => `${s.body} ${s.url}`);
    const parsed = await jsonCall<{ sources: { body: string; url: string }[] }>({
      schema: {
        type: "object", additionalProperties: false, required: ["sources"],
        properties: {
          sources: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["body", "url"],
              properties: { body: { type: "string" }, url: { type: "string" } },
            },
          },
        },
      },
      system:
        "You propose OFFICIAL government bodies and primary-law sources (with real canonical " +
        "URLs) relevant to a company from the given country setting up or operating in Canada. " +
        "Only official/government/primary-law sites, no blogs, firms, or commentary. Prefer " +
        "pages that carry substantive rules. Do not repeat sources already listed.",
      user:
        `Country/corridor: ${corridor}\n\nAlready in the registry:\n${existing.join("\n")}\n\n` +
        `Propose up to 8 new official sources.`,
    });
    const sources = (parsed.sources ?? []).filter((s) => s.body && /^https?:\/\//.test(s.url));
    return { ok: true, sources };
  } catch (e) {
    return { ok: false, message: errMsg(e), sources: [] };
  }
}

/**
 * AI proposes official sources whose content can answer a specific set of curriculum
 * questions (one pillar block), for the active corridor. You pick which to add; they are
 * tagged to the current corridor and ingested from section 2 so Generate/Autopilot can
 * cite them.
 */
export async function discoverPillarSources(
  pillarTitle: string,
  questions: string[],
): Promise<{ ok: boolean; message?: string; sources: { body: string; url: string }[] }> {
  try {
    const label = await corridorLabel(await getActiveCorridor());
    const existing = (await allSources()).map((s) => `${s.body} ${s.url}`);
    const parsed = await jsonCall<{ sources: { body: string; url: string }[] }>({
      schema: {
        type: "object", additionalProperties: false, required: ["sources"],
        properties: {
          sources: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["body", "url"],
              properties: { body: { type: "string" }, url: { type: "string" } },
            },
          },
        },
      },
      system:
        `You propose OFFICIAL government bodies and primary-law sources (with real canonical ` +
        `URLs) whose content can ANSWER the specific questions below, for a company from ${label} ` +
        "setting up or operating in Canada. Only official/government/primary-law sites (e.g. " +
        "canada.ca, laws-lois.justice.gc.ca, cra-arc.gc.ca, official home-country government and " +
        "legislation sites, official treaty texts), never blogs, advisory firms, or commentary. " +
        "Give the specific page most likely to contain the answer, not just a homepage. Do not " +
        "repeat sources already listed.",
      user:
        `Corridor: ${label}\nPillar: ${pillarTitle}\n\nQuestions to answer:\n` +
        `${questions.map((q) => `- ${q}`).join("\n")}\n\nAlready in the registry:\n${existing.join("\n")}\n\n` +
        `Propose up to 6 official sources that would let us answer these questions well.`,
    });
    const sources = (parsed.sources ?? []).filter((s) => s.body && /^https?:\/\//.test(s.url));
    return { ok: true, sources };
  } catch (e) {
    return { ok: false, message: errMsg(e), sources: [] };
  }
}

/** Add a discovered source to the active corridor (crawled), then it can be ingested. */
export async function addDiscoveredSource(body: string, url: string): Promise<ActionResult> {
  return addSource({ body, url, corridor: await getActiveCorridor(), crawl: true });
}

/** Re-fetch a source's seed page, detect a content change, and flag units that cite it. */
export async function checkSourceFreshness(
  sourceId: string,
): Promise<{ ok: boolean; changed: boolean; flagged: number; message: string }> {
  const source = (await allSources()).find((s) => s.id === sourceId);
  if (!source) return { ok: false, changed: false, flagged: 0, message: "Unknown source." };
  try {
    const r = await runFreshnessCheck(source);
    if (r.changed) revalidatePath("/admin");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, changed: false, flagged: 0, message: `${sourceId}: ${errMsg(e)}` };
  }
}

export async function removeSource(id: string): Promise<ActionResult> {
  try {
    await deleteCustomSource(id);
    revalidatePath("/admin");
    return { ok: true, message: "Removed." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/**
 * Generate a unit end-to-end: corridor-aware retrieval → cited draft → dual-retrieval
 * verification → auto-publish (factual + all agree) or route to the queue.
 */
export async function generateUnit(topicSlug: string, guidance?: string): Promise<ActionResult> {
  const CORRIDOR = await getActiveCorridor();
  const topic = (await listTopics(CORRIDOR)).find((t) => t.slug === topicSlug);
  if (!topic) return { ok: false, message: "Unknown topic." };
  const pillar = pillarBySlug(topic.pillarSlug);
  if (!pillar) return { ok: false, message: "Unknown pillar." };
  const label = await corridorLabel(CORRIDOR);

  try {
    const sourceIds = await selectSources(topic.question, CORRIDOR);
    const spans = await retrieveSpans(topic.question, sourceIds);
    if (spans.length === 0) {
      return { ok: false, message: "No source passages retrieved — ingest the relevant sources first." };
    }
    const draft = await writeUnit({
      question: topic.question,
      corridor: CORRIDOR,
      corridorLabel: label,
      pillar: pillar.n as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      riskTier: topic.riskTier,
      spans,
      guidance,
    });
    if (draft.claims.length === 0) {
      return { ok: false, message: "Draft produced no source-grounded claims. Try ingesting more sources." };
    }

    const verdict = await verifyClaims(draft.claims, sourceIds, topic.riskTier);
    const decision = route(topic.riskTier, verdict);

    const claims = draft.claims.map((c, i) => ({
      text: c.text,
      sourceId: c.sourceId,
      locator: c.locator,
      verified: verdict.claims[i]?.outcome === "agree",
    }));

    const body = [
      draft.directAnswer,
      draft.keyTakeaways.length ? `## Key takeaways\n\n${draft.keyTakeaways.map((k) => `- ${k}`).join("\n")}` : "",
      ...draft.sections.map((s) => `## ${s.heading}\n\n${s.body}`),
      draft.corridorDelta ? `## How it differs for a company from ${label}\n\n${draft.corridorDelta}` : "",
      draft.checklist.length ? `## Checklist\n\n${draft.checklist.map((c) => `- ${c}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const queueReason =
      decision === "operator"
        ? topic.riskTier === "interpretive"
          ? "interpretive"
          : "verification-disagreement"
        : undefined;

    await storeUnit({
      id: `${CORRIDOR}-${topicSlug}`,
      slug: topicSlug,
      question: topic.question,
      pillar: pillar.n,
      layer: "overlay",
      corridor: CORRIDOR,
      jurisdictions: ["CA", "DE"],
      riskTier: topic.riskTier,
      status: decision === "auto-ship" ? "published" : "in_review",
      lastReviewed: new Date().toISOString().slice(0, 10),
      cta: "Book a 20-minute Canada-entry call",
      author: process.env.AUTHOR_NAME || "InterGest Canada",
      credentials: process.env.AUTHOR_CREDENTIALS || "Cross-border setup, tax & compliance, InterGest Canada",
      body,
      claims,
      citations: [...new Set(claims.map((c) => c.sourceId))],
      queueReason,
    });

    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        decision === "auto-ship"
          ? `Published automatically (${claims.length} claims, all verified).`
          : `Drafted ${claims.length} claims → sent to the review queue (${queueReason}).`,
    };
  } catch (e) {
    return { ok: false, message: `Failed (Opus runs can exceed 60s on Hobby): ${errMsg(e)}` };
  }
}

// ---- Content editing + grounded AI assist -----------------------------------

export async function saveUnitBody(slug: string, body: string): Promise<ActionResult> {
  try {
    await dbSaveBody(await getActiveCorridor(), slug, body);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/**
 * Grounded AI writing assist for the editor. Retrieves the unit's source spans and
 * rewrites a selection or drafts a new passage using ONLY those spans — same
 * no-hallucination contract as the writer. Returns plain text to drop into the editor.
 */
export async function aiAssist(
  slug: string,
  instruction: string,
  selectedText: string,
): Promise<{ ok: boolean; text?: string; message?: string }> {
  try {
    const CORRIDOR = await getActiveCorridor();
    const unit = await getUnitContent(CORRIDOR, slug);
    if (!unit) return { ok: false, message: "Unit not found." };

    const sourceIds = await selectSources(unit.question, CORRIDOR);
    const spans = await retrieveSpans(unit.question, sourceIds, 8);
    if (spans.length === 0) {
      return { ok: false, message: "No source passages available — ingest the relevant sources first." };
    }
    const spanList = spans
      .map((s, i) => `[span ${i}] sourceId=${s.chunk.sourceId}\n${s.chunk.text}`)
      .join("\n\n");

    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system:
        "You are an editing assistant for authoritative cross-border guidance. You may use " +
        "ONLY the provided official source spans. Never invent figures, thresholds, sections, " +
        "or rules; if the spans do not support something, do not write it. No meta-commentary " +
        "('general information only', mentions of sources or AI, etc.). Match the existing " +
        "clear, specific, plain-English voice. Return ONLY the passage text — no preamble, no " +
        "JSON, no quotes around it.",
      messages: [
        {
          role: "user",
          content:
            `Question this unit answers: ${unit.question}\n\n` +
            `Official source spans you may use:\n${spanList}\n\n` +
            (selectedText
              ? `Rewrite this passage per the instruction below:\n"""${selectedText}"""\n\n`
              : "") +
            `Instruction: ${instruction}\n\nReturn only the resulting passage text.`,
        },
      ],
    });
    return { ok: true, text: textOf(msg).trim() };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export type EditSuggestion = {
  reason: string;
  mode: "insert_after" | "replace" | "append_section";
  anchor: string;
  newText: string;
  sourceIds: string[];
};

const noEmDash = (s: string) => s.replace(/\s*—\s*/g, ", ");

/**
 * Grounded "enhance this draft" pass. Reads the whole body plus the unit's official
 * source spans, then proposes a small set of precise, source-backed edits the operator
 * approves or rejects one by one. Unlike regenerate (which overwrites), this preserves
 * what is already good and only fills the specific gaps the sources can support. Same
 * no-hallucination contract: every suggestion must be backed by a retrieved span.
 */
export async function suggestEdits(
  slug: string,
): Promise<{ ok: boolean; suggestions?: EditSuggestion[]; message?: string }> {
  try {
    const CORRIDOR = await getActiveCorridor();
    const unit = await getUnitContent(CORRIDOR, slug);
    if (!unit) return { ok: false, message: "Unit not found." };
    const body = unit.body ?? "";
    if (!body.trim()) return { ok: false, message: "Nothing to enhance yet. Generate a draft first." };

    const sourceIds = await selectSources(unit.question, CORRIDOR);
    const spans = await retrieveSpans(unit.question, sourceIds, 16);
    if (spans.length === 0) {
      return { ok: false, message: "No source passages available — ingest the relevant sources first." };
    }
    const knownSources = new Set(spans.map((s) => s.chunk.sourceId));
    const spanList = spans
      .map((s, i) => `[span ${i}] sourceId=${s.chunk.sourceId}\n${s.chunk.text}`)
      .join("\n\n");

    const parsed = await jsonCall<{ suggestions: EditSuggestion[] }>({
      maxTokens: 4000,
      schema: {
        type: "object", additionalProperties: false, required: ["suggestions"],
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["reason", "mode", "anchor", "newText", "sourceIds"],
              properties: {
                reason: { type: "string" },
                mode: { type: "string", enum: ["insert_after", "replace", "append_section"] },
                anchor: { type: "string" },
                newText: { type: "string" },
                sourceIds: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      system:
        "You improve an existing piece of authoritative cross-border guidance by proposing a " +
        "small set of precise, surgical edits. You may use ONLY the official source spans " +
        "provided. Never invent figures, thresholds, section numbers, or rules; if a span does " +
        "not support a detail, do not propose it. Find material facts, figures, conditions, or " +
        "exceptions that the spans support but the draft omits, gets vague about, or under-explains. " +
        "Preserve what is already good: propose additions and tightenings, not a rewrite. No " +
        "meta-commentary (no 'general information', no mention of sources or AI in the prose). " +
        "Match the draft's clear, specific, plain-English voice. Never use em-dashes.\n\n" +
        "For each suggestion:\n" +
        "- reason: one sentence on what is missing or weak and why this helps the reader.\n" +
        "- mode: 'insert_after' (add new text after an anchor), 'replace' (swap an anchor for " +
        "stronger text), or 'append_section' (add a new section at the end).\n" +
        "- anchor: for insert_after/replace, copy a SHORT, VERBATIM, UNIQUE snippet (5 to 12 words) " +
        "from the current draft that marks the spot, exactly as written. For append_section, use \"\".\n" +
        "- newText: the markdown to insert or the replacement text. Use '##' for any new heading and " +
        "'- ' for lists. Same voice. No em-dashes.\n" +
        "- sourceIds: the source ids (from the spans) that back the new facts.\n\n" +
        "Return the 3 to 7 highest-value suggestions. If the draft already fully reflects the spans, " +
        "return an empty list.",
      user:
        `Question this unit answers: ${unit.question}\n\n` +
        `Current draft (markdown):\n"""\n${body}\n"""\n\n` +
        `Official source spans you may use:\n${spanList}`,
    });

    // Enforce grounding + anchorability: keep only suggestions backed by a real span source,
    // and (for non-append modes) whose anchor actually exists in the draft.
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const bodyNorm = norm(body);
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .map((s) => ({
        reason: noEmDash(String(s?.reason ?? "")),
        mode: (["insert_after", "replace", "append_section"].includes(s?.mode) ? s.mode : "append_section") as EditSuggestion["mode"],
        anchor: String(s?.anchor ?? ""),
        newText: noEmDash(String(s?.newText ?? "")),
        sourceIds: Array.isArray(s?.sourceIds) ? s.sourceIds.map(String) : [],
      }))
      .filter((s) => s.newText.trim().length > 0)
      .filter((s) => s.sourceIds.some((id) => knownSources.has(id)))
      .filter((s) => s.mode === "append_section" || (s.anchor.trim() && bodyNorm.includes(norm(s.anchor))));

    return { ok: true, suggestions };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** AI value assessment of a generated unit (specificity, grounding, usefulness). */
export async function assessUnit(
  slug: string,
): Promise<{ ok: boolean; score?: number; text?: string; message?: string }> {
  try {
    const unit = await getUnitContent(await getActiveCorridor(), slug);
    if (!unit) return { ok: false, message: "Unit not found." };
    const r = await assessUnitValue(unit.question, unit.body ?? "", unit.citations);
    return { ok: true, score: r.score, text: r.text };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Reject a queued unit: delete it entirely (the topic returns to not-generated). */
export async function rejectUnit(unitId: string): Promise<ActionResult> {
  try {
    await deleteUnit(unitId);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Rejected and removed." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Keep the topic but delete its generated content for the active corridor. */
export async function resetUnitContent(slug: string): Promise<ActionResult> {
  try {
    const corridor = await getActiveCorridor();
    const removed = await deleteUnitFor(corridor, slug);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return removed > 0
      ? { ok: true, message: "Content cleared. Generate again to start fresh." }
      : { ok: false, message: `No content found to clear for ${await corridorLabel(corridor)}.` };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** AI-draft a short, grounded answer to a reader question (operator edits then publishes). */
export async function draftAnswer(
  corridor: string,
  question: string,
): Promise<{ ok: boolean; text?: string; message?: string }> {
  try {
    const sourceIds = await selectSources(question, corridor);
    const spans = await retrieveSpans(question, sourceIds, 6);
    if (spans.length === 0) return { ok: false, message: "No source passages — ingest relevant sources first." };
    const context = spans.map((s) => `[${s.chunk.sourceId}] ${s.chunk.text}`).join("\n\n");
    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 800,
      system:
        "Answer the reader's question in 2-4 sentences using ONLY the official source " +
        "passages. Cite source ids in brackets. Never invent figures or rules. No " +
        "meta-commentary. Never use em-dashes.",
      messages: [{ role: "user", content: `Question: ${question}\n\nOfficial source passages:\n${context}` }],
    });
    return { ok: true, text: textOf(msg).replace(/\s*—\s*/g, ", ").trim() };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function publishQuestion(id: string, answer: string): Promise<ActionResult> {
  if (answer.trim().length < 5) return { ok: false, message: "Write an answer first." };
  try {
    await publishQuestionAnswer(id, answer.trim());
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Published to the guide." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export async function dismissQuestion(id: string): Promise<ActionResult> {
  try {
    await deleteQuestion(id);
    revalidatePath("/admin");
    return { ok: true, message: "Dismissed." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Save the booking CTA (label + URL) used on guides, in llms.txt, and the chat. */
export async function saveCta(label: string, url: string): Promise<ActionResult> {
  try {
    await setSetting("cta_label", label.trim());
    await setSetting("cta_url", url.trim());
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "CTA saved." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Set the operator/viewer corridor (cookie). */
export async function setCorridor(slug: string): Promise<void> {
  (await cookies()).set("corridor", slug, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

export async function addCorridor(label: string): Promise<ActionResult> {
  const slug = slugifyId(label);
  if (!slug) return { ok: false, message: "Give the corridor a name." };
  try {
    await insertCorridor(slug, label.trim());
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: `Added corridor "${label}". Select it to generate for it.` };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export async function removeCorridor(slug: string): Promise<ActionResult> {
  try {
    await deleteCorridor(slug);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Corridor removed." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Operator approval — verify claims, publish, resolve the queue entry. */
export async function approveUnit(unitId: string): Promise<ActionResult> {
  try {
    await dbApprove(unitId);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Published." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}
