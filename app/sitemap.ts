import type { MetadataRoute } from "next";
import { journey } from "@/lib/content";
import { listTopics, unitStatusBySlug } from "@/lib/db";
import { DEFAULT_CORRIDOR } from "@/lib/corridor";

export const dynamic = "force-dynamic";

const BASE = process.env.SITE_URL || "https://ig-docs.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [{ url: BASE, changeFrequency: "weekly", priority: 1 }];
  // Stage + pillar landing pages.
  for (const s of journey) {
    urls.push({ url: `${BASE}/${s.slug}`, changeFrequency: "monthly", priority: 0.5 });
    for (const p of s.pillars) urls.push({ url: `${BASE}/${s.slug}/${p.slug}`, changeFrequency: "monthly", priority: 0.6 });
  }
  // Published units only.
  try {
    const [topics, status] = await Promise.all([listTopics(), unitStatusBySlug(DEFAULT_CORRIDOR)]);
    for (const t of topics) {
      if (status[t.slug] === "published") {
        urls.push({ url: `${BASE}/${t.stage}/${t.pillarSlug}/${t.slug}`, changeFrequency: "monthly", priority: 0.8 });
      }
    }
  } catch {
    /* DB unavailable at build — landing pages still listed */
  }
  return urls;
}
