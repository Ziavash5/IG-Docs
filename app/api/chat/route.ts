import { NextRequest } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { CHAT_SYSTEM, type ChatTurn } from "@/lib/chat";
import { selectSources, retrieveSpans } from "@/lib/pipeline/retrieve";
import { getActiveCorridor } from "@/lib/corridor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Streaming grounded chat. Retrieves official passages, then streams a cited answer. */
export async function POST(req: NextRequest) {
  const { history } = (await req.json()) as { history: ChatTurn[] };
  const corridor = await getActiveCorridor();
  const lastUser = [...(history ?? [])].reverse().find((t) => t.role === "user")?.content ?? "";

  const sourceIds = await selectSources(lastUser, corridor);
  const spans = await retrieveSpans(lastUser, sourceIds, 8);
  const sources = [...new Set(spans.map((s) => s.chunk.sourceId))].slice(0, 6);
  const context = spans.map((s) => `[${s.chunk.sourceId}] ${s.chunk.text}`).join("\n\n") || "(no passages retrieved)";

  const stream = anthropic().messages.stream({
    model: MODEL,
    max_tokens: 1200,
    system:
      `${CHAT_SYSTEM}\n\nOfficial source passages you may use:\n${context}\n\n` +
      "Answer grounded only in these passages. Do not use em-dashes. If the answer depends " +
      "on the company's specifics, end your reply with the token [[CALL]] on its own line.",
    messages: (history ?? []).slice(-8).map((t) => ({ role: t.role, content: t.content })),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n(Sorry, something went wrong.)"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-chat-sources": sources.join(",") },
  });
}
