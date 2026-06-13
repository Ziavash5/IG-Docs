import { journey } from "@/lib/content";
import { SOURCE_REGISTRY } from "@/lib/sources-registry";
import { openQueue, ingestStats, type QueueRow } from "@/lib/db";
import { generateUnit, approveUnit, ingestOne, ingestEverything } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // requires Vercel Pro; Hobby caps at 60s

export const metadata = { title: "Admin — Corridor Authority Engine" };

export default async function Admin() {
  let stats: { sources: number; chunks: number } | null = null;
  let queue: QueueRow[] = [];
  let dbError: string | null = null;
  try {
    [stats, queue] = await Promise.all([ingestStats(), openQueue()]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "8px 0" }}>
      <p className="eyebrow">Corridor Authority Engine</p>
      <h1 style={{ fontSize: 32 }}>Operator console</h1>
      <p className="lead" style={{ fontSize: 17 }}>
        Ingest official sources, generate cited units, and approve what reaches the
        public corpus. Your review question is always: <em>does the cited source support
        this claim?</em>
      </p>

      {dbError && (
        <div className="in-production" style={{ borderColor: "#e0b4b4" }}>
          <strong>Database not reachable.</strong>
          <p style={{ margin: "6px 0 0" }}>
            {dbError}. Set <code>DATABASE_URL</code> (and run <code>supabase/schema.sql</code>),
            <code> ANTHROPIC_API_KEY</code>, and <code>VOYAGE_API_KEY</code> in the environment.
          </p>
        </div>
      )}

      {/* 1 — Ingestion */}
      <h2>1 · Ingest sources</h2>
      <p style={{ color: "var(--color-muted)" }}>
        {stats ? `${stats.sources} sources · ${stats.chunks} chunks in the corpus.` : "—"} Ingest
        per-source to stay within serverless time limits.
      </p>
      <form action={ingestEverything} style={{ marginBottom: 12 }}>
        <button className="book-call-btn" type="submit">Ingest all sources</button>
      </form>
      <ul className="unit-list">
        {SOURCE_REGISTRY.map((s) => (
          <li key={s.id}>
            <div className="unit-link" style={{ cursor: "default" }}>
              <span className="source-chip">{s.id}</span>
              <span className="unit-link-q" style={{ fontSize: 14 }}>{s.body}</span>
              <form action={ingestOne.bind(null, s.id)}>
                <button className="ghost-btn" type="submit">Ingest</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      {/* 2 — Generate */}
      <h2 style={{ marginTop: 48 }}>2 · Generate units</h2>
      <p style={{ color: "var(--color-muted)" }}>
        Drafts a cited unit and runs dual-retrieval verification. Factual units that pass
        auto-publish; interpretive units and disagreements route to review below.
      </p>
      {journey.map((stage) =>
        stage.pillars.map((p) => (
          <div key={p.slug} style={{ margin: "16px 0" }}>
            <p className="card-n">Pillar {p.n} · {p.title}</p>
            <ul className="unit-list" style={{ margin: "6px 0" }}>
              {p.units
                .filter((u) => u.state === "planned")
                .map((u) => (
                  <li key={u.slug}>
                    <div className="unit-link" style={{ cursor: "default" }}>
                      <span className={`tier-chip tier-${u.riskTier}`}>{u.riskTier}</span>
                      <span className="unit-link-q" style={{ fontSize: 14 }}>{u.question}</span>
                      <form action={generateUnit.bind(null, stage.slug, p.slug, u.slug)}>
                        <button className="ghost-btn" type="submit">Generate</button>
                      </form>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )),
      )}

      {/* 3 — Approval queue */}
      <h2 style={{ marginTop: 48 }}>3 · Approval queue ({queue.length})</h2>
      {queue.length === 0 && <p style={{ color: "var(--color-muted)" }}>Nothing waiting for review.</p>}
      {queue.map((row) => (
        <div key={row.queueId} className="corridor-callout">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong>{row.question}</strong>
            <span className={`status-badge state-in_review`}>{row.reason}</span>
          </div>
          <table className="claim-table">
            <thead>
              <tr><th>Claim</th><th>Source</th><th>Verified</th></tr>
            </thead>
            <tbody>
              {row.claims.map((c, i) => (
                <tr key={i}>
                  <td>{c.text}</td>
                  <td>
                    <a href={c.locator} target="_blank" rel="noreferrer" className="source-chip">
                      {c.sourceId}
                    </a>
                  </td>
                  <td>{c.verified ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={approveUnit.bind(null, row.unitId)} style={{ marginTop: 12 }}>
            <button className="book-call-btn" type="submit">Approve &amp; publish</button>
          </form>
        </div>
      ))}
    </div>
  );
}
