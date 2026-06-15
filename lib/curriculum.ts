import {
  journey,
  pillarShells,
  pillarByNumber,
  defaultTopicRows,
  type Stage,
  type UnitEntry,
  type UnitState,
} from "./content";
import type { RiskTier } from "./question-unit";
import {
  listTopics,
  unitStatusBySlug,
  unitsForCorridor,
  insertTopic,
  topicCount,
  type PublicUnit,
} from "./db";
import { getUnitContent } from "./db";
import { anthropic, MODEL, textOf, jsonCall } from "./anthropic";

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

export async function getCurriculum(corridor: string): Promise<Stage[]> {
  try {
    const topics = await listTopics(corridor);
    if (topics.length === 0) return pillarShells(); // this corridor has no topics yet
    const statuses = await unitStatusBySlug(corridor);
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

/** Generated content for a corridor's slug, or null (callers fall back to the exemplar). */
export async function unitContent(corridor: string, slug: string): Promise<PublicUnit | null> {
  try {
    return await getUnitContent(corridor, slug);
  } catch {
    return null;
  }
}

/** Seed one corridor's topics from the in-code defaults (idempotent). */
export async function seedDefaults(corridor: string, label = "Germany"): Promise<number> {
  const rows = defaultTopicRows(corridor, label);
  for (const r of rows) await insertTopic(r);
  return rows.length;
}

export async function isSeeded(corridor: string): Promise<boolean> {
  try {
    return (await topicCount(corridor)) > 0;
  } catch {
    return false;
  }
}

/**
 * Rebuild missing topics for a corridor from its generated units. Units are stored
 * per-corridor, so if topics were deleted (e.g. by the old shared-curriculum bug) the
 * content still exists but is no longer listed. This re-creates a topic for every unit
 * that has lost its topic, restoring the content to the curriculum and public site.
 * Returns how many topics were recovered.
 */
export async function recoverContent(corridor: string): Promise<number> {
  const [units, topics] = await Promise.all([unitsForCorridor(corridor), listTopics(corridor)]);
  const have = new Set(topics.map((t) => t.slug));
  let recovered = 0;
  for (const u of units) {
    if (have.has(u.slug)) continue;
    const p = pillarByNumber(u.pillar);
    if (!p) continue;
    // Short nav label from the slug; the operator can Rename it afterwards.
    const title = u.slug.replace(/^[a-z]{2,}-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 48);
    await insertTopic({
      id: `${corridor}-${u.slug}`,
      corridor,
      stage: p.stageSlug,
      pillarSlug: p.pillarSlug,
      slug: u.slug,
      title: title || u.slug,
      question: u.question,
      riskTier: (u.riskTier === "interpretive" ? "interpretive" : "factual") as RiskTier,
      position: 100 + recovered,
    });
    recovered++;
  }
  return recovered;
}

/** Ask Claude for the most logical reading order; returns ordered slugs. */
export async function autoOrderSlugs(
  pillarTitle: string,
  topics: { slug: string; question: string }[],
): Promise<string[]> {
  if (topics.length < 2) return topics.map((t) => t.slug);
  try {
    const parsed = await jsonCall<{ order: string[] }>({
      maxTokens: 1000,
      schema: {
        type: "object", additionalProperties: false, required: ["order"],
        properties: { order: { type: "array", items: { type: "string" } } },
      },
      system:
        "You order questions into the sequence a foreign company would naturally work " +
        "through them: foundational decisions first, then dependent steps. List every " +
        "provided slug exactly once.",
      user: `Pillar: ${pillarTitle}\n\n${topics.map((t) => `- ${t.slug}: ${t.question}`).join("\n")}`,
    });
    const valid = parsed.order.filter((s) => topics.some((t) => t.slug === s));
    const missing = topics.map((t) => t.slug).filter((s) => !valid.includes(s));
    return [...valid, ...missing];
  } catch {
    return topics.map((t) => t.slug);
  }
}

/** AI review of a pillar's topic set: gaps, duplicates, weak questions, ordering. */
export async function assessCurriculum(
  pillarTitle: string,
  service: string,
  questions: string[],
  corridorLabel = "Germany",
): Promise<string> {
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system:
      `You are an editor auditing a corridor-specific knowledge hub for companies from ` +
      `${corridorLabel} entering Canada. Assess this pillar's question set for: coverage gaps ` +
      "(high-value questions a buyer would ask but are missing), duplicates or overlap, " +
      "vague or low-value questions, and whether the ordering is logical. Consider what is " +
      `specific to the ${corridorLabel}-Canada corridor (treaty, social-security agreement, ` +
      "home-country tax rules, trade agreement). Be specific and concise. Plain text, short " +
      "sections with dashes. No preamble.",
    messages: [
      {
        role: "user",
        content:
          `Pillar: ${pillarTitle} (InterGest service: ${service})\nCorridor: ${corridorLabel}\n\n` +
          `Current questions:\n${questions.map((q) => `- ${q}`).join("\n")}`,
      },
    ],
  });
  return textOf(msg).trim();
}

export interface ValueReport {
  score: number; // 1–5
  text: string;
}

/** Assess a generated unit for specificity, source-grounding, and real usefulness. */
export async function assessUnitValue(
  question: string,
  body: string,
  citations: string[],
): Promise<ValueReport> {
  const parsed = await jsonCall<{ score: number; findings: string }>({
    maxTokens: 1200,
    schema: {
      type: "object", additionalProperties: false, required: ["score", "findings"],
      properties: { score: { type: "integer" }, findings: { type: "string" } },
    },
    system:
      "You assess whether a knowledge-hub answer is genuinely valuable to a foreign company " +
      "entering Canada. Score 1-5 on: specificity (real thresholds, sections, forms, numbers " +
      "vs vague generalities), grounding (claims tied to the cited official sources), and " +
      "usefulness (hard-to-find, decision-useful content vs generic blog filler). Penalise " +
      "hedging, padding, and anything unsupported. Be blunt and concrete. findings is a " +
      "dash-bulleted string.",
    user: `Question: ${question}\nCited sources: ${citations.join(", ") || "(none)"}\n\nAnswer:\n${body || "(empty)"}`,
  });
  return { score: Number(parsed.score) || 0, text: parsed.findings ?? "" };
}

export interface SuggestedTopic {
  title: string;
  question: string;
  riskTier: RiskTier;
}

/** Ask Claude to propose new question-topics for a pillar in a given corridor. */
export async function suggestTopics(
  pillarTitle: string,
  service: string,
  existingQuestions: string[],
  corridorLabel = "Germany",
): Promise<SuggestedTopic[]> {
  const parsed = await jsonCall<{ topics: SuggestedTopic[] }>({
    schema: {
      type: "object", additionalProperties: false, required: ["topics"],
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["title", "question", "riskTier"],
            properties: {
              title: { type: "string" }, question: { type: "string" },
              riskTier: { type: "string", enum: ["factual", "interpretive"] },
            },
          },
        },
      },
    },
    system:
      `You propose new long-tail questions a company from ${corridorLabel} would ask about this ` +
      "part of setting up or operating in Canada. Each must be specific, answerable from official " +
      "sources, and not a duplicate of the existing ones. Favour questions that are genuinely " +
      `specific to the ${corridorLabel}-Canada corridor where relevant (tax treaty, social-security ` +
      "agreement, home-country tax/CFC rules, trade agreement, immigration routes). Mark riskTier " +
      "'interpretive' for treaty/PE/transfer-pricing/immigration-eligibility matters, otherwise 'factual'.",
    user:
      `Pillar: ${pillarTitle} (InterGest service: ${service})\nCorridor: ${corridorLabel}\n\n` +
      `Existing questions:\n${existingQuestions.map((q) => `- ${q}`).join("\n")}\n\nPropose 4 new ones.`,
  });
  return (parsed.topics ?? []).filter((t) => t.question && t.title);
}
