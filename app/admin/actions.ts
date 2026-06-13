"use server";

import { revalidatePath } from "next/cache";
import { findUnit } from "@/lib/content";
import { selectSources, retrieveSpans } from "@/lib/pipeline/retrieve";
import { writeUnit } from "@/lib/pipeline/write";
import { verifyClaims, route } from "@/lib/pipeline/verify";
import { ingestSource, ingestAll } from "@/lib/pipeline/ingest";
import { SOURCE_REGISTRY } from "@/lib/sources-registry";
import { storeUnit, approveUnit as dbApprove } from "@/lib/db";
import type { Corridor } from "@/lib/question-unit";

const CORRIDOR: Corridor = "dach";

export type ActionResult = { ok: boolean; message: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ingest one official source into pgvector. */
export async function ingestOne(sourceId: string): Promise<ActionResult> {
  const source = SOURCE_REGISTRY.find((s) => s.id === sourceId);
  if (!source) return { ok: false, message: "Unknown source." };
  try {
    const r = await ingestSource(source);
    revalidatePath("/admin");
    return r.chunks > 0
      ? { ok: true, message: `Ingested ${r.chunks} passages.` }
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
export async function generateUnit(
  stage: string,
  pillarSlug: string,
  unitSlug: string,
): Promise<ActionResult> {
  const found = findUnit(stage, pillarSlug, unitSlug);
  if (!found) return { ok: false, message: "Unknown unit." };
  const { pillar, unit } = found;

  try {
    const sourceIds = await selectSources(unit.question, CORRIDOR);
    const spans = await retrieveSpans(unit.question, sourceIds);
    if (spans.length === 0) {
      return { ok: false, message: "No source passages retrieved — ingest the relevant sources first." };
    }
    const draft = await writeUnit({
      question: unit.question,
      corridor: CORRIDOR,
      pillar: pillar.n as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      riskTier: unit.riskTier,
      spans,
    });
    if (draft.claims.length === 0) {
      return { ok: false, message: "Draft produced no source-grounded claims. Try ingesting more sources." };
    }

    const verdict = await verifyClaims(draft.claims, sourceIds, unit.riskTier);
    const decision = route(unit.riskTier, verdict);

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
        ? unit.riskTier === "interpretive"
          ? "interpretive"
          : "verification-disagreement"
        : undefined;

    await storeUnit({
      id: `${CORRIDOR}-${unitSlug}`,
      slug: unitSlug,
      question: unit.question,
      pillar: pillar.n,
      layer: "overlay",
      corridor: CORRIDOR,
      jurisdictions: ["CA", "DE"],
      riskTier: unit.riskTier,
      status: decision === "auto-ship" ? "published" : "in_review",
      lastReviewed: new Date().toISOString().slice(0, 10),
      cta: "Book a 20-minute Canada-entry call",
      body,
      claims,
      citations: [...new Set(claims.map((c) => c.sourceId))],
      queueReason,
    });

    revalidatePath("/admin");
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

/** Operator approval — verify claims, publish, resolve the queue entry. */
export async function approveUnit(unitId: string): Promise<ActionResult> {
  try {
    await dbApprove(unitId);
    revalidatePath("/admin");
    return { ok: true, message: "Published." };
  } catch (e) {
    return { ok: false, message: `Failed: ${errMsg(e)}` };
  }
}
