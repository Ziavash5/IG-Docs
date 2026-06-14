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

/**
 * A single-shot call that returns a structured object, guaranteed-valid via forced
 * tool-use (the API validates the tool input against the schema and returns it as an
 * object, so there is no JSON text to parse and nothing can come back malformed).
 */
export async function jsonCall<T>(args: {
  system: string;
  user: string;
  schema: object;
  maxTokens?: number;
}): Promise<T> {
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: args.maxTokens ?? 1500,
    system: args.system,
    tools: [{ name: "emit", description: "Return the structured result.", input_schema: args.schema as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "emit" },
    messages: [{ role: "user", content: args.user }],
  });
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error("No structured output returned");
  return block.input as T;
}
