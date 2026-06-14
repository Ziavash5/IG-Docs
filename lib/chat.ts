import type { Corridor } from "./question-unit";
import { selectSources, retrieveSpans } from "./pipeline/retrieve";
import { anthropic, MODEL, textOf, parseJson } from "./anthropic";

/**
 * The grounded assistant. It answers a German company's questions about Canada using
 * ONLY the official source passages we retrieve, cites them, and — when the answer turns
 * on the company's specifics — points to a short call as the genuinely useful next step,
 * never as a pitch.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
export interface ChatResult {
  answer: string;
  sources: string[];
  suggestCall: boolean;
}

export const CHAT_SYSTEM =
  "You are the InterGest Canada assistant for companies from Germany expanding to Canada. " +
  "You are a sharp, confident, warm advisor.\n\n" +
  "RULES:\n" +
  "1. Use ONLY the official source passages provided. Cite the source ids you used in " +
  "square brackets, e.g. [cra-gsthst]. Never invent figures, rules, sections, or sources.\n" +
  "2. LEAD with the useful answer. Never open with caveats and never narrate what the " +
  "sources do or do not contain ('the source material I have...'). If a specific detail " +
  "isn't available, give what you can and move on, with no meta-commentary.\n" +
  "3. Sound credible and human. Short paragraphs, a few **bold** key terms, short bullet " +
  "lists when useful. Plain language. NEVER use em-dashes; use commas or periods. Do not " +
  "use the word 'Honestly' or hedging filler.\n" +
  "4. You are a funnel: helpful first, then guide naturally. For anything that depends on " +
  "the company's specifics (treaty, permanent establishment, transfer pricing, immigration " +
  "eligibility), explain the rule and the deciding factors, then offer the genuinely useful " +
  "next step (a short call, or leaving their details so we follow up). Never pushy.\n" +
  "5. Ask one good clarifying question when it would materially sharpen the answer (their " +
  "industry, whether they already have a Canadian entity, timeline).";

export async function answerChat(history: ChatTurn[], corridor: Corridor): Promise<ChatResult> {
  const lastUser = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  if (!lastUser.trim()) return { answer: "Ask me anything about setting up in Canada.", sources: [], suggestCall: false };

  const sourceIds = await selectSources(lastUser, corridor);
  const spans = await retrieveSpans(lastUser, sourceIds, 8);
  const context = spans.map((s) => `[${s.chunk.sourceId}] ${s.chunk.text}`).join("\n\n") || "(no passages retrieved)";

  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system:
      `${CHAT_SYSTEM}\n\nOfficial source passages you may use:\n${context}\n\n` +
      `Respond with a single JSON object: {"answer": "<markdown, grounded only in the passages>", ` +
      `"sources": ["sourceId", ...], "suggestCall": true|false}. Set suggestCall true when the answer ` +
      `depends on the company's specifics or the user is clearly evaluating a move.`,
    messages: history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
  });

  const parsed = parseJson<ChatResult>(textOf(msg));
  return {
    answer: parsed.answer ?? "",
    sources: [...new Set(parsed.sources ?? [])],
    suggestCall: !!parsed.suggestCall,
  };
}
