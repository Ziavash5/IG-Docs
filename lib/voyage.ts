/**
 * Voyage AI embeddings via REST (no official TS SDK). voyage-3 → 1024 dims, matching
 * the pgvector column in supabase/schema.sql. Retries on 429 with backoff and paces
 * batches, so a rate limit slows ingestion instead of failing it. Note: Voyage's free
 * tier (3 RPM / 10K TPM) is too small for deep ingestion — add a payment method to lift
 * it (the free token grant still applies).
 */
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3";
const BATCH = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(
  texts: string[],
  inputType: "document" | "query",
  attempt = 0,
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType }),
  });

  if (res.status === 429 && attempt < 6) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt * 5) * 1000;
    await sleep(wait);
    return embedBatch(texts, inputType, attempt + 1);
  }
  if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

/** Embed source chunks (paced batches, retrying on rate limits). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH), "document")));
    if (i + BATCH < texts.length) await sleep(400);
  }
  return out;
}

/** Embed a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [e] = await embedBatch([text], "query");
  return e;
}
