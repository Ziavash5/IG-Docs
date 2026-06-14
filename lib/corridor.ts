import { cookies } from "next/headers";
import { corridors as DEFAULT_CORRIDORS } from "./content";
import { listCorridors } from "./db";

export const DEFAULT_CORRIDOR = "germany";

export interface CorridorItem { slug: string; label: string; active: boolean }

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

/** The corridor the current viewer/operator has selected (cookie), default Germany. */
export async function getActiveCorridor(): Promise<string> {
  try {
    return (await cookies()).get("corridor")?.value || DEFAULT_CORRIDOR;
  } catch {
    return DEFAULT_CORRIDOR;
  }
}
