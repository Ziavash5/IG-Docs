import { createHash } from "node:crypto";
import type { Source } from "./pipeline/types";
import { fetchPage } from "./pipeline/ingest";
import { getSourceHash, setSourceHash, flagUnitsForSource } from "./db";

/**
 * Re-fetch a source's seed page, hash its content, and if it changed since last check,
 * send any published unit that cites it back to review. Shared by the manual button and
 * the scheduled cron.
 */
export async function runFreshnessCheck(
  source: Source,
): Promise<{ changed: boolean; flagged: number; message: string }> {
  if (source.id.startsWith("custom-pdf-")) {
    return { changed: false, flagged: 0, message: `${source.id}: uploaded file (skipped).` };
  }
  const page = await fetchPage(source.url);
  if (!page) return { changed: false, flagged: 0, message: `${source.id}: unreachable.` };
  const hash = createHash("sha256").update(page.text).digest("hex");
  const prev = await getSourceHash(source.id);
  await setSourceHash(source.id, hash);
  if (prev && prev !== hash) {
    const flagged = await flagUnitsForSource(source.id);
    return { changed: true, flagged, message: `${source.id}: CHANGED — ${flagged} unit(s) flagged.` };
  }
  return { changed: false, flagged: 0, message: `${source.id}: ${prev ? "unchanged" : "baseline saved"}.` };
}
