import Anthropic from "@anthropic-ai/sdk";

/** Lazily-constructed Claude client (keeps `next build` working without a key). */
let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic();
  }
  return _client;
}

export const MODEL = "claude-opus-4-8";

/** Concatenate the text blocks of a Messages response. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Parse a JSON object out of a model response, tolerating ```json fences.
 * The writer/verifier/selector are all instructed to emit a single JSON object.
 */
export function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(body.slice(start, end + 1)) as T;
}
