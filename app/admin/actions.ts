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

/** Ingest one official source into pgvector (kept small for serverless time limits). */
export async function ingestOne(sourceId: string): Promise<void> {
  const source = SOURCE_REGISTRY.find((s) => s.id === sourceId);
  if (!source) return;
  try {
    await ingestSource(source);
  } catch (e) {
    console.error("ingestOne failed:", e);
  }
  revalidatePath("/admin");
}

/** Ingest the whole registry (may exceed the time limit on small plans). */
export async function ingestEverything(): Promise<void> {
  try {
    await ingestAll();
  } catch (e) {
    console.error("ingestEverything failed:", e);
  }
  revalidatePath("/admin");
}

/**
 * Generate a unit end-to-end: corridor-aware retrieval → cited draft → dual-retrieval
 * verification → either auto-publish (factual + all agree) or route to the queue.
 */
export async function generateUnit(
  stage: string,
  pillarSlug: string,
  unitSlug: string,
): Promise<void> {
  const found = findUnit(stage, pillarSlug, unitSlug);
  if (!found) return;
  const { pillar, unit } = found;

  try {
    const sourceIds = await selectSources(unit.question, CORRIDOR);
    const spans = await retrieveSpans(unit.question, sourceIds);
    const draft = await writeUnit({
      question: unit.question,
      corridor: CORRIDOR,
      pillar: pillar.n as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      riskTier: unit.riskTier,
      spans,
    });

    const verdict = await verifyClaims(draft.claims, sourceIds, unit.riskTier);
    const decision = route(unit.riskTier, verdict);

    // Mark claims verified where both passes agreed.
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
  } catch (e) {
    console.error("generateUnit failed:", e);
  }
  revalidatePath("/admin");
}

/** Operator approval — verify claims, publish, resolve the queue entry. */
export async function approveUnit(unitId: string): Promise<void> {
  try {
    await dbApprove(unitId);
  } catch (e) {
    console.error("approveUnit failed:", e);
  }
  revalidatePath("/admin");
}
