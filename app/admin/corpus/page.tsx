import { allSources } from "@/lib/sources-registry";
import { sourceChunkCounts } from "@/lib/db";
import { CorpusExplorer } from "../corpus-explorer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Corpus explorer — Corridor Authority Engine" };

export default async function CorpusPage() {
  let sources: { id: string; body: string; corridor: string; passages: number }[] = [];
  try {
    const [all, counts] = await Promise.all([allSources(), sourceChunkCounts()]);
    sources = all.map((s) => ({ id: s.id, body: s.body, corridor: s.corridor, passages: counts[s.id] ?? 0 }));
  } catch {
    sources = [];
  }
  return <CorpusExplorer sources={sources} />;
}
