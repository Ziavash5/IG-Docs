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

/** Built-in corridors merged with the console: DB rows override active/label, and add new ones. */
export async function allCorridors(): Promise<CorridorItem[]> {
  const map = new Map<string, CorridorItem>();
  for (const c of DEFAULT_CORRIDORS) map.set(c.slug, { slug: c.slug, label: c.label, active: c.active });
  try {
    for (const c of await listCorridors()) {
      map.set(c.slug, { slug: c.slug, label: c.label, active: c.active });
    }
  } catch {
    /* DB unavailable — built-in defaults only */
  }
  return [...map.values()];
}
