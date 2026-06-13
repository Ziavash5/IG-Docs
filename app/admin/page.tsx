import { getCurriculum, isSeeded } from "@/lib/curriculum";
import { allSources } from "@/lib/sources-registry";
import { openQueue, ingestStats, sourceChunkCounts, type QueueRow } from "@/lib/db";
import { approveUnit, ingestStep, ingestRestart, removeSource, seedCurriculum } from "./actions";
import { ActionButton, AssessButton, RegenerateBox, AddSourceForm } from "./buttons";
import { PillarEditor } from "./curriculum";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const metadata = { title: "Admin — Corridor Authority Engine" };

export default async function Admin() {
  let stats: { sources: number; chunks: number } | null = null;
  let queue: QueueRow[] = [];
  let counts: Record<string, number> = {};
  let journey = await getCurriculum();
  let seeded = await isSeeded();
  let sources = await allSources();
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
        Build the curriculum, ingest official sources, generate cited units, and approve
        what reaches the public corpus. Your review question is always: <em>does the
        cited source support this claim?</em>
      </p>

      {dbError && (
        <div className="in-production" style={{ borderColor: "#e0b4b4" }}>
          <strong>Database not reachable.</strong>
          <p style={{ margin: "6px 0 0" }}>
            {dbError}. Set <code>DATABASE_URL</code> (and run both files in{" "}
            <code>supabase/</code>), <code>ANTHROPIC_API_KEY</code>, and{" "}
            <code>VOYAGE_API_KEY</code>.
          </p>
        </div>
      )}

      {/* 1 — Curriculum */}
      <h2>1 · Curriculum</h2>
      <p style={{ color: "var(--color-muted)" }}>
        Add, edit, remove, or ask AI to propose topics. Generate writes a cited draft for
        a topic. Edits show up in the public navigation.
      </p>
      {!seeded && (
        <div style={{ margin: "10px 0 18px" }}>
          <ActionButton action={seedCurriculum} idleLabel="Seed starter curriculum" busyLabel="Seeding…" variant="primary" />
          <p style={{ color: "var(--color-faint)", fontSize: 13, marginTop: 6 }}>
            Loads the default DACH topics so you have a starting point. You can change everything after.
          </p>
        </div>
      )}
      {journey.map((stage) => (
        <section key={stage.slug} style={{ marginTop: 20 }}>
          <p className="nav-stage-label" style={{ padding: 0 }}>{stage.label}</p>
          {stage.pillars.map((p) => (
            <div key={p.slug} style={{ margin: "12px 0 22px" }}>
              <p className="card-n">Pillar {p.n} · {p.title}</p>
              <PillarEditor
                stageSlug={stage.slug}
                pillarSlug={p.slug}
                pillarTitle={p.title}
                service={p.service}
                units={p.units.map((u) => ({
                  slug: u.slug,
                  title: u.title,
                  question: u.question,
                  riskTier: u.riskTier,
                  state: u.state,
                }))}
              />
            </div>
          ))}
        </section>
      ))}

      {/* 2 — Ingestion */}
      <h2 style={{ marginTop: 48 }}>2 · Ingest sources</h2>
      <p style={{ color: "var(--color-muted)" }}>
        {stats ? `${stats.sources} sources, ${stats.chunks} passages in the corpus.` : "—"} Ingest
        runs in small batches: click Ingest, and if pages remain, click again to continue.
        The writer can only cite what is in the corpus.
      </p>
      <AddSourceForm />
      <ul className="unit-list">
        {sources.map((s) => {
          const n = counts[s.id] ?? 0;
          const custom = s.id.startsWith("custom-");
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
                <ActionButton action={ingestStep.bind(null, s.id)} idleLabel={n > 0 ? "Continue" : "Ingest"} busyLabel="Ingesting…" />
                <ActionButton action={ingestRestart.bind(null, s.id)} idleLabel="Restart" busyLabel="Restarting…" />
                {custom && <ActionButton action={removeSource.bind(null, s.id)} idleLabel="Delete" busyLabel="…" />}
              </div>
            </li>
          );
        })}
      </ul>

      {/* 3 — Approval queue */}
      <h2 style={{ marginTop: 48 }}>3 · Approval queue ({queue.length})</h2>
      {queue.length === 0 && <p style={{ color: "var(--color-muted)" }}>Nothing waiting for review.</p>}
      {queue.map((row) => (
        <div key={row.queueId} className="corridor-callout">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong>{row.question}</strong>
            <span className="status-badge state-in_review">{row.reason}</span>
          </div>
          {row.body && (
            <details className="draft-preview">
              <summary>Read the draft</summary>
              <pre>{row.body}</pre>
            </details>
          )}
          {row.claims.length > 0 ? (
            <table className="claim-table">
              <thead><tr><th>Claim</th><th>Source</th><th>Verified</th></tr></thead>
              <tbody>
                {row.claims.map((c, i) => (
                  <tr key={i}>
                    <td>{c.text}</td>
                    <td><a href={c.locator} target="_blank" rel="noreferrer" className="source-chip">{c.sourceId}</a></td>
                    <td>{c.verified ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--color-muted)", fontSize: 14, marginTop: 10 }}>
              No source-backed claims were extracted, usually because the relevant source
              was not ingested. Ingest the right source (section 2) and regenerate.
            </p>
          )}
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <ActionButton action={approveUnit.bind(null, row.unitId)} idleLabel="Approve & publish" busyLabel="Publishing…" variant="primary" />
            <a className="ghost-btn" href={`/admin/edit/${row.slug}`}>Edit content</a>
          </div>
          <RegenerateBox slug={row.slug} />
          <div style={{ marginTop: 10 }}>
            <AssessButton slug={row.slug} />
          </div>
        </div>
      ))}
    </div>
  );
}
