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
} from "@/lib/db";
import { runFreshnessCheck } from "@/lib/freshness";
import { getActiveCorridor } from "@/lib/corridor";
import { cookies } from "next/headers";
import { anthropic, MODEL, textOf, jsonCall } from "@/lib/anthropic";
import {
  seedDefaults,
  suggestTopics,
  autoOrderSlugs,
  assessCurriculum,
  assessUnitValue,
  type SuggestedTopic,
} from "@/lib/curriculum";
import type { Corridor, RiskTier } from "@/lib/question-unit";

export type ActionResult = { ok: boolean; message: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ---- Curriculum authoring ---------------------------------------------------

export async function seedCurriculum(): Promise<ActionResult> {
  try {
    const n = await seedDefaults();
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: `Seeded ${n} topics from defaults.` };
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
    const slug = `${slugify(t.title)}-${Math.random().toString(36).slice(2, 6)}`;
    await insertTopic({
      id: slug,
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
  id: string,
  t: { title: string; question: string; riskTier: RiskTier },
): Promise<ActionResult> {
  try {
    await updateTopic(id, { title: t.title, question: t.question, riskTier: t.riskTier });
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

export async function removeTopic(id: string): Promise<ActionResult> {
  try {
    await deleteTopic(id);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Removed." };
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
    const suggestions = await suggestTopics(pillarTitle, service, existing);
    return { ok: true, suggestions };
  } catch (e) {
    return { ok: false, message: errMsg(e), suggestions: [] };
  }
}

/** Persist a manual reorder (client passes the new slug order for one pillar). */
export async function reorder(orderedSlugs: string[]): Promise<ActionResult> {
  try {
    await reorderTopics(orderedSlugs);
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
    const topics = (await listTopics()).filter((t) => t.pillarSlug === pillarSlug);
    const ordered = await autoOrderSlugs(pillarTitle, topics.map((t) => ({ slug: t.slug, question: t.question })));
    await reorderTopics(ordered);
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
    return { ok: true, text: await assessCurriculum(pillarTitle, service, questions) };
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
    const topics = await listTopics();
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
  const topic = (await listTopics()).find((t) => t.slug === topicSlug);
  if (!topic) return { ok: false, message: "Unknown topic." };
  const pillar = pillarBySlug(topic.pillarSlug);
  if (!pillar) return { ok: false, message: "Unknown pillar." };
  const CORRIDOR = await getActiveCorridor();

  try {
    const sourceIds = await selectSources(topic.question, CORRIDOR);
    const spans = await retrieveSpans(topic.question, sourceIds);
    if (spans.length === 0) {
      return { ok: false, message: "No source passages retrieved — ingest the relevant sources first." };
    }
    const draft = await writeUnit({
      question: topic.question,
      corridor: CORRIDOR,
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
      draft.corridorDelta ? `## How it differs for a German company\n\n${draft.corridorDelta}` : "",
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
    await dbSaveBody(slug, body);
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
    await deleteUnit(`${corridor}-${slug}`);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return { ok: true, message: "Content cleared. Generate again to start fresh." };
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
