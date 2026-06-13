"use server";

import { revalidatePath } from "next/cache";
import { pillarBySlug } from "@/lib/content";
import { selectSources, retrieveSpans } from "@/lib/pipeline/retrieve";
import { writeUnit } from "@/lib/pipeline/write";
import { verifyClaims, route } from "@/lib/pipeline/verify";
import { ingestSource, ingestAll } from "@/lib/pipeline/ingest";
import { SOURCE_REGISTRY } from "@/lib/sources-registry";
import {
  storeUnit,
  approveUnit as dbApprove,
  listTopics,
  insertTopic,
  updateTopic,
  deleteTopic,
  saveUnitBody as dbSaveBody,
  getUnitContent,
} from "@/lib/db";
import { anthropic, MODEL, textOf } from "@/lib/anthropic";
import { seedDefaults, suggestTopics, type SuggestedTopic } from "@/lib/curriculum";
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

/** Ingest one official source into pgvector. */
export async function ingestOne(sourceId: string): Promise<ActionResult> {
  const source = SOURCE_REGISTRY.find((s) => s.id === sourceId);
  if (!source) return { ok: false, message: "Unknown source." };
  try {
    const r = await ingestSource(source);
    revalidatePath("/admin");
    return r.chunks > 0
      ? { ok: true, message: `Ingested ${r.chunks} passages from ${r.pages} page(s).` }
      : { ok: false, message: "Fetched, but no usable text (source may block bots or be JS-rendered)." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}

/** Ingest the whole registry. Likely to exceed the 60s limit on Vercel Hobby. */
export async function ingestEverything(): Promise<ActionResult> {
  try {
    const results = await ingestAll();
    const ok = results.filter((r) => r.chunks > 0);
    const total = results.reduce((a, r) => a + r.chunks, 0);
    const failed = results.filter((r) => r.chunks === 0).map((r) => r.sourceId);
    revalidatePath("/admin");
    return {
      ok: ok.length > 0,
      message:
        `Ingested ${ok.length}/${results.length} sources (${total} passages).` +
        (failed.length ? ` No text from: ${failed.join(", ")}.` : ""),
    };
  } catch (e) {
    return { ok: false, message: `Failed (likely a 60s timeout — ingest per-source): ${errMsg(e)}` };
  }
}

/**
 * Generate a unit end-to-end: corridor-aware retrieval → cited draft → dual-retrieval
 * verification → auto-publish (factual + all agree) or route to the queue.
 */
export async function generateUnit(topicSlug: string): Promise<ActionResult> {
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
