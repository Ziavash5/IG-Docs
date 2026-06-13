import { journey } from "@/lib/content";
import { SOURCE_REGISTRY } from "@/lib/sources-registry";
import { openQueue, ingestStats, sourceChunkCounts, type QueueRow } from "@/lib/db";
import { generateUnit, approveUnit, ingestOne, ingestEverything } from "./actions";
import { ActionButton } from "./buttons";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // requires Vercel Pro; Hobby caps at 60s

export const metadata = { title: "Admin — Corridor Authority Engine" };

export default async function Admin() {
  let stats: { sources: number; chunks: number } | null = null;
  let queue: QueueRow[] = [];
  let counts: Record<string, number> = {};
  let dbError: string | null = null;
  try {
    [stats, queue, counts] = await Promise.all([ingestStats(), openQueue(), sourceChunkCounts()]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "8px 0" }}>
      <p className="eyebrow">Corridor Authority Engine</p>
      <h1 style={{ fontSize: 32 }}>Operator console</h1>
      <p className="lead" style={{ fontSize: 17 }}>
        Ingest official sources, generate cited units, and approve what reaches the public
        corpus. Your review question is always: <em>does the cited source support this
        claim?</em>
      </p>

      {dbError && (
        <div className="in-production" style={{ borderColor: "#e0b4b4" }}>
          <strong>Database not reachable.</strong>
          <p style={{ margin: "6px 0 0" }}>
            {dbError}. Set <code>DATABASE_URL</code> (and run <code>supabase/schema.sql</code>),
            <code> ANTHROPIC_API_KEY</code>, and <code>VOYAGE_API_KEY</code>.
          </p>
        </div>
      )}

      {/* 1 — Ingestion */}
      <h2>1 · Ingest sources</h2>
      <p style={{ color: "var(--color-muted)" }}>
        {stats ? `${stats.sources} sources, ${stats.chunks} passages in the corpus.` : "—"} On
        Vercel Hobby (60s limit) ingest one source at a time; “ingest all” may time out
        partway.
      </p>
      <div style={{ margin: "12px 0" }}>
        <ActionButton action={ingestEverything} idleLabel="Ingest all sources" busyLabel="Ingesting all…" variant="primary" />
      </div>
      <ul className="unit-list">
        {SOURCE_REGISTRY.map((s) => {
          const n = counts[s.id] ?? 0;
          return (
            <li key={s.id}>
              <div className="unit-link" style={{ cursor: "default" }}>
                <span className={`nav-dot ${n > 0 ? "state-published" : "state-planned"}`} aria-hidden />
                <span className="source-chip">{s.id}</span>
                <span className="unit-link-q" style={{ fontSize: 14, flex: 1 }}>
                  {s.body}
                  <span style={{ color: "var(--color-faint)", marginLeft: 8 }}>
                    {n > 0 ? `${n} passages` : "not ingested"}
                  </span>
                </span>
                <ActionButton action={ingestOne.bind(null, s.id)} idleLabel="Ingest" busyLabel="Ingesting…" />
              </div>
            </li>
          );
        })}
      </ul>

      {/* 2 — Generate */}
      <h2 style={{ marginTop: 48 }}>2 · Generate units</h2>
      <p style={{ color: "var(--color-muted)" }}>
        Drafts a cited unit and runs dual-retrieval verification. Factual units that pass
        auto-publish; interpretive units and disagreements route to review below. Ingest
        the relevant sources first.
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
                      <ActionButton
                        action={generateUnit.bind(null, stage.slug, p.slug, u.slug)}
                        idleLabel="Generate"
                        busyLabel="Generating…"
                      />
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
            <span className="status-badge state-in_review">{row.reason}</span>
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
          <div style={{ marginTop: 12 }}>
            <ActionButton
              action={approveUnit.bind(null, row.unitId)}
              idleLabel="Approve & publish"
              busyLabel="Publishing…"
              variant="primary"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
