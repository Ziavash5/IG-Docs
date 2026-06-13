import type { Corridor } from "../question-unit";
import type { RetrievedSpan } from "./types";
import { anthropic, MODEL, textOf, parseJson } from "../anthropic";
import { embedQuery } from "../voyage";
import { searchChunks } from "../db";
import { candidatesFor } from "../sources-registry";

/**
 * Corridor-aware retrieval. Claude selects which registered sources matter for THIS
 * question in THIS corridor; vector search then pulls the supporting spans from
 * pgvector. Falls back to all corridor candidates if source-selection fails.
 */

export async function selectSources(question: string, corridor: Corridor): Promise<string[]> {
  const candidates = candidatesFor(corridor);
  const ids = candidates.map((c) => c.id);
  try {
    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system:
        "You select which official sources are relevant to a corridor-specific question " +
        "about setting up or operating a foreign company in Canada. Return only sources " +
        "that could contain the answer. Respond with a single JSON object.",
      messages: [
        {
          role: "user",
          content:
            `Corridor: ${corridor}\nQuestion: ${question}\n\nCandidate sources:\n` +
            candidates.map((c) => `- ${c.id}: ${c.body} (${c.url})`).join("\n") +
            `\n\nReturn JSON: {"sourceIds": ["id", ...]} with the relevant source ids only.`,
        },
      ],
    });
    const parsed = parseJson<{ sourceIds: string[] }>(textOf(msg));
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
  return searchChunks(embedding, sourceIds, k);
}
