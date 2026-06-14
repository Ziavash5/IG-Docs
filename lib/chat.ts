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

const SYSTEM =
  "You are the InterGest Canada assistant. You help a company from Germany understand how " +
  "to set up and operate in Canada. Be genuinely useful, specific, and concise — a sharp " +
  "advisor, not a sales bot.\n\n" +
  "RULES:\n" +
  "1. Use ONLY the official source passages provided below. Cite the source ids you relied " +
  "on. Never invent figures, rules, sections, or sources.\n" +
  "2. If the passages do not cover the question, say so plainly and offer a short call " +
  "rather than guessing.\n" +
  "3. For matters that depend on the company's specific situation (treaty application, " +
  "permanent establishment, transfer pricing, immigration eligibility), give the general " +
  "rule and the factors that decide it, then suggest a 20-minute call as the most useful " +
  "next step. Helpful and warm, never pushy, never salesy.\n" +
  "4. Keep answers focused and skimmable. Plain language.";

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
      `${SYSTEM}\n\nOfficial source passages you may use:\n${context}\n\n` +
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
