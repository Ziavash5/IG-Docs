import {
  journey,
  pillarShells,
  defaultTopicRows,
  type Stage,
  type UnitEntry,
  type UnitState,
} from "./content";
import type { RiskTier } from "./question-unit";
import {
  listTopics,
  unitStatusBySlug,
  insertTopic,
  topicCount,
  type PublicUnit,
} from "./db";
import { getUnitContent } from "./db";
import { anthropic, MODEL, textOf, parseJson } from "./anthropic";

/**
 * The curriculum is editable and DB-backed. This module assembles the navigable tree
 * from the pillar config (lib/content.ts) plus the topics table, and always falls back
 * to the in-code defaults so the site never breaks if the DB is empty or unreachable.
 */

function toState(status?: string): UnitState {
  if (status === "published") return "published";
  if (status === "in_review" || status === "draft") return "in_review";
  return "planned";
}

export async function getCurriculum(): Promise<Stage[]> {
  try {
    const topics = await listTopics();
    if (topics.length === 0) return journey; // not seeded yet
    const statuses = await unitStatusBySlug();
    const shells = pillarShells();
    for (const stage of shells) {
      for (const pillar of stage.pillars) {
        pillar.units = topics
          .filter((t) => t.pillarSlug === pillar.slug)
          .sort((a, b) => a.position - b.position)
          .map<UnitEntry>((t) => ({
            slug: t.slug,
            title: t.title,
            question: t.question,
            riskTier: t.riskTier,
            state: toState(statuses[t.slug]),
          }));
      }
    }
    return shells;
  } catch {
    return journey; // DB unreachable — fall back to defaults
  }
}

/** Generated content for a slug, or null (callers fall back to the in-code exemplar). */
export async function unitContent(slug: string): Promise<PublicUnit | null> {
  try {
    return await getUnitContent(slug);
  } catch {
    return null;
  }
}

/** Seed the topics table from the in-code defaults (idempotent). */
export async function seedDefaults(): Promise<number> {
  const rows = defaultTopicRows();
  for (const r of rows) await insertTopic(r);
  return rows.length;
}

export async function isSeeded(): Promise<boolean> {
  try {
    return (await topicCount()) > 0;
  } catch {
    return false;
  }
}

export interface SuggestedTopic {
  title: string;
  question: string;
  riskTier: RiskTier;
}

/** Ask Claude to propose new question-topics for a pillar in the DACH corridor. */
export async function suggestTopics(
  pillarTitle: string,
  service: string,
  existingQuestions: string[],
): Promise<SuggestedTopic[]> {
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system:
      "You propose new long-tail questions a German, Austrian, or Swiss company would " +
      "ask about this part of setting up or operating in Canada. Each must be specific, " +
      "answerable from official sources, and not a duplicate of the existing ones. Mark " +
      "riskTier 'interpretive' for treaty/PE/transfer-pricing/immigration-eligibility " +
      "matters, otherwise 'factual'. Respond with a single JSON object.",
    messages: [
      {
        role: "user",
        content:
          `Pillar: ${pillarTitle} (InterGest service: ${service})\nCorridor: DACH\n\n` +
          `Existing questions:\n${existingQuestions.map((q) => `- ${q}`).join("\n")}\n\n` +
          `Propose 4 new ones. Return JSON: {"topics": [{"title": "short label", ` +
          `"question": "the full question", "riskTier": "factual|interpretive"}]}`,
      },
    ],
  });
  const parsed = parseJson<{ topics: SuggestedTopic[] }>(textOf(msg));
  return (parsed.topics ?? []).filter((t) => t.question && t.title);
}
