import type { MetadataRoute } from "next";

const BASE = process.env.SITE_URL || "https://ig-docs.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
