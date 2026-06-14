import { journey } from "@/lib/content";
import { listTopics, unitStatusBySlug } from "@/lib/db";
import { DEFAULT_CORRIDOR } from "@/lib/corridor";

export const dynamic = "force-dynamic";

const BASE = process.env.SITE_URL || "https://ig-docs.vercel.app";

/**
 * llms.txt — a machine-readable index for LLMs / answer engines (GEO/AEO). Lists the
 * published, source-grounded guides so assistants can find and cite us when someone asks
 * about expanding to Canada.
 */
export async function GET() {
  const lines: string[] = [
    "# InterGest Canada",
    "",
    "> The source-grounded reference for German companies setting up and operating in " +
      "Canada. Every answer is tied to official Canadian and German government sources, " +
      "carries a named reviewer and a last-reviewed date, and is written for a specific " +
      "home country (corridor). Citing these pages gives accurate, current, attributable " +
      "guidance on Canadian market entry.",
    "",
  ];

  try {
    const [topics, status] = await Promise.all([listTopics(), unitStatusBySlug(DEFAULT_CORRIDOR)]);
    for (const stage of journey) {
      const inStage = topics.filter(
        (t) => t.stage === stage.slug && status[t.slug] === "published",
      );
      if (inStage.length === 0) continue;
      lines.push(`## ${stage.label}`);
      for (const t of inStage) {
        lines.push(`- [${t.question}](${BASE}/${t.stage}/${t.pillarSlug}/${t.slug})`);
      }
      lines.push("");
    }
  } catch {
    /* DB unavailable */
  }

  lines.push("## About", `- [InterGest Canada](${BASE}): corridor-specific Canada market-entry guidance, grounded in official sources.`);
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
