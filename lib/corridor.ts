import { cookies, headers } from "next/headers";
import { corridors as DEFAULT_CORRIDORS } from "./content";
import { listCorridors } from "./db";

export const DEFAULT_CORRIDOR = "germany";

export interface CorridorItem { slug: string; label: string; active: boolean }

// First path segments that are not corridors.
const RESERVED = new Set(["", "admin", "api", "sitemap.xml", "robots.txt", "llms.txt", "favicon.ico"]);

/**
 * The corridor for this request. Public pages set it from the URL's first segment (via
 * middleware's x-corridor header) so each corridor has its own crawlable URL. Admin pages
 * (and anything without a corridor segment) fall back to the operator's cookie, then the
 * default.
 */
export async function getActiveCorridor(): Promise<string> {
  try {
    const fromUrl = (await headers()).get("x-corridor") || "";
    if (fromUrl && !RESERVED.has(fromUrl)) return fromUrl;
    const fromCookie = (await cookies()).get("corridor")?.value;
    if (fromCookie) return fromCookie;
  } catch {
    /* ignore */
  }
  return DEFAULT_CORRIDOR;
}

/** Built-in corridors plus any added in the console. */
export async function allCorridors(): Promise<CorridorItem[]> {
  const defaults = DEFAULT_CORRIDORS.map((c) => ({ slug: c.slug, label: c.label, active: c.active }));
  try {
    const custom = await listCorridors();
    const seen = new Set(defaults.map((d) => d.slug));
    return [...defaults, ...custom.filter((c) => !seen.has(c.slug)).map((c) => ({ ...c, active: true }))];
  } catch {
    return defaults;
  }
}
