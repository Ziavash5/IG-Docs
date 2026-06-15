import { NextRequest } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { CHAT_SYSTEM, type ChatTurn } from "@/lib/chat";
import { selectSources, retrieveSpans } from "@/lib/pipeline/retrieve";
import { getActiveCorridor } from "@/lib/corridor";
import { allLanguages } from "@/lib/i18n";
import { bumpRate } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RATE_PER_MIN = 15;

/** Streaming grounded chat. Retrieves official passages, then streams a cited answer. */
export async function POST(req: NextRequest) {
  // Per-IP rate limit so the public endpoint can't run up the API bill.
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  try {
    if ((await bumpRate(`chat:${ip}`, 60)) > RATE_PER_MIN) {
      return new Response("Too many requests. Please wait a minute.", { status: 429 });
    }
  } catch {
    /* if the limiter is unavailable, fail open */
  }

  const { history } = (await req.json()) as { history: ChatTurn[] };
  const corridor = await getActiveCorridor();
  const lastUser = ([...(history ?? [])].reverse().find((t) => t.role === "user")?.content ?? "").slice(0, 2000);

  // Answer in the reader's chosen language; retrieval/grounding stays on the English corpus.
  const lang = req.cookies.get("lang")?.value || "en";
  let langLabel = "";
  if (lang !== "en") {
    try {
      langLabel = (await allLanguages()).find((l) => l.slug === lang)?.label ?? "";
    } catch {
      langLabel = "";
    }
  }

  const sourceIds = await selectSources(lastUser, corridor);
  const spans = await retrieveSpans(lastUser, sourceIds, 8);
  const sources = [...new Set(spans.map((s) => s.chunk.sourceId))].slice(0, 6);
  const context = spans.map((s) => `[${s.chunk.sourceId}] ${s.chunk.text}`).join("\n\n") || "(no passages retrieved)";

  const langRule = langLabel
    ? `\n\nWrite your entire reply to the user in ${langLabel}. Keep source ids, numbers, ` +
      "statute and agency names, and the brand in their original form. Output the [[CALL]] " +
      "token exactly as [[CALL]] (do not translate it)."
    : "";

  const stream = anthropic().messages.stream({
    model: MODEL,
    max_tokens: 1200,
    system:
      `${CHAT_SYSTEM}\n\nOfficial source passages you may use:\n${context}\n\n` +
      "Answer grounded only in these passages. Do not use em-dashes. If the answer depends " +
      "on the company's specifics, end your reply with the token [[CALL]] on its own line." +
      langRule,
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
