import type { Corridor } from "../question-unit";
import type { RetrievedSpan } from "./types";
import { jsonCall } from "../anthropic";
import { embedQuery, rerank } from "../voyage";
import { searchChunks } from "../db";
import { candidatesFor } from "../sources-registry";

/**
 * Corridor-aware retrieval. Claude selects which registered sources matter for THIS
 * question in THIS corridor; vector search then pulls the supporting spans from
 * pgvector. Falls back to all corridor candidates if source-selection fails.
 */

export async function selectSources(question: string, corridor: Corridor): Promise<string[]> {
  const candidates = await candidatesFor(corridor);
  const ids = candidates.map((c) => c.id);
  try {
    const parsed = await jsonCall<{ sourceIds: string[] }>({
      maxTokens: 1024,
      schema: {
        type: "object", additionalProperties: false, required: ["sourceIds"],
        properties: { sourceIds: { type: "array", items: { type: "string" } } },
      },
      system:
        "You select which official sources are relevant to a corridor-specific question " +
        "about setting up or operating a foreign company in Canada. Return only sources " +
        "that could contain the answer.",
      user:
        `Corridor: ${corridor}\nQuestion: ${question}\n\nCandidate sources:\n` +
        candidates.map((c) => `- ${c.id}: ${c.body} (${c.url})`).join("\n"),
    });
    const picked = parsed.sourceIds.filter((id) => ids.includes(id));
    return picked.length ? picked : ids;
  } catch (e) {
    console.error("selectSources fell back to all candidates:", e);
    return ids;
  }
}

export async function retrieveSpans(
  question: string,
  sourceIds: string[],
  k = 8,
): Promise<RetrievedSpan[]> {
  const embedding = await embedQuery(question);
  // Over-fetch by vector similarity, then rerank for precision (sharper, more even).
  const candidates = await searchChunks(embedding, sourceIds, Math.max(k * 3, 24));
  if (candidates.length <= k) return candidates;
  try {
    const order = await rerank(question, candidates.map((c) => c.chunk.text), k);
    return order.map((i) => candidates[i]).filter(Boolean);
  } catch {
    return candidates.slice(0, k);
  }
}
