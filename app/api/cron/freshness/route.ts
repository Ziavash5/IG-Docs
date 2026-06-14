import { NextRequest, NextResponse } from "next/server";
import { allSources } from "@/lib/sources-registry";
import { runFreshnessCheck } from "@/lib/freshness";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled freshness check (Vercel Cron, see vercel.json). Re-checks every source and
 * flags units that cite a changed source. Secured with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  let changed = 0;
  let flagged = 0;
  const sources = await allSources();
  for (const s of sources) {
    try {
      const r = await runFreshnessCheck(s);
      if (r.changed) {
        changed++;
        flagged += r.flagged;
      }
    } catch {
      /* skip and continue */
    }
  }
  return NextResponse.json({ checked: sources.length, changed, flagged });
}
