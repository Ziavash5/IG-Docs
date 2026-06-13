"use server";

import { revalidatePath } from "next/cache";
import { pillarBySlug } from "@/lib/content";
import { selectSources, retrieveSpans } from "@/lib/pipeline/retrieve";
import { writeUnit } from "@/lib/pipeline/write";
import { verifyClaims, route } from "@/lib/pipeline/verify";
import { fetchPage, chunkPage } from "@/lib/pipeline/ingest";
import { embedDocuments } from "@/lib/voyage";
import { allSources } from "@/lib/sources-registry";
import {
  storeUnit,
  approveUnit as dbApprove,
  listTopics,
  insertTopic,
  updateTopic,
  deleteTopic,
  reorderTopics,
  saveUnitBody as dbSaveBody,
  getUnitContent,
  upsertSource,
  insertChunks,
  clearSourceData,
  queueCounts,
  seedIngestQueue,
  nextPending,
  markQueueDone,
  addPending,
  insertCustomSource,
  deleteCustomSource,
} from "@/lib/db";
import { anthropic, MODEL, textOf } from "@/lib/anthropic";
import {
  seedDefaults,
  suggestTopics,
  autoOrderSlugs,
  assessCurriculum,
  assessUnitValue,
  type SuggestedTopic,
} from "@/lib/curriculum";
import type { Corridor, RiskTier } from "@/lib/question-unit";

const CORRIDOR: Corridor = "dach";

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

const needsWork = (c: { pending: number; done: number }) =>
  c.pending > 0 || (c.pending === 0 && c.done === 0);

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

/** One batch across the whole corpus, for the client-driven "ingest all" loop. */
export async function ingestAllStep(): Promise<StepResult> {
  try {
    const sources = await allSources();
    for (const s of sources) {
      if (needsWork(await queueCounts(s.id))) {
        const r = await processSourceBatch(s);
        let remaining = false;
        for (const s2 of sources) {
          if (needsWork(await queueCounts(s2.id))) { remaining = true; break; }
        }
        revalidatePath("/admin");
        return { ok: true, done: !remaining, message: `${s.id}: +${r.added} passages${r.complete ? " (done)" : ""}.` };
      }
    }
    return { ok: true, done: true, message: "All sources ingested." };
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
      ...draft.sections.map((s) => `## ${s.heading}\n\n${s.body}`),
      draft.corridorDelta ? `## How it differs for your corridor (DACH)\n\n${draft.corridorDelta}` : "",
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
    const unit = await getUnitContent(slug);
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
    const unit = await getUnitContent(slug);
    if (!unit) return { ok: false, message: "Unit not found." };
    const r = await assessUnitValue(unit.question, unit.body ?? "", unit.citations);
    return { ok: true, score: r.score, text: r.text };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
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
