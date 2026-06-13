/**
 * Voyage AI embeddings via REST (no official TS SDK). voyage-3 → 1024 dims, matching
 * the pgvector column in supabase/schema.sql.
 */
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3";

async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType }),
  });
  if (!res.ok) {
    throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

/** Embed source chunks (batched to respect Voyage's per-request limits). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    out.push(...(await embed(texts.slice(i, i + 100), "document")));
  }
  return out;
}

/** Embed a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [e] = await embed([text], "query");
  return e;
}
