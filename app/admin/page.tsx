import { getCurriculum, isSeeded } from "@/lib/curriculum";
import { allSources } from "@/lib/sources-registry";
import { getActiveCorridor, allCorridors } from "@/lib/corridor";
import { openQueue, ingestStats, sourceChunkCounts, listLeads, pendingQuestions, type QueueRow, type LeadRow, type QuestionRow } from "@/lib/db";
import { approveUnit, rejectUnit, seedCurriculum, recoverCurriculum, clearCurriculum } from "./actions";
import { ActionButton, AssessButton, RegenerateBox, AddSourceForm, PdfUploadForm, AutopilotButton, DiscoverPanel, FreshnessButton, CorridorBar, CtaSettings, QaReviewItem, LanguageManager } from "./buttons";
import { getCta } from "@/lib/cta";
import { allLanguages } from "@/lib/i18n";
import { PillarEditor } from "./curriculum";
import { SourcePanel } from "./source-panel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const metadata = { title: "Admin — Corridor Authority Engine" };

export default async function Admin() {
  let stats: { sources: number; chunks: number } | null = null;
  let queue: QueueRow[] = [];
  let counts: Record<string, number> = {};
  let leads: LeadRow[] = [];
  let questions: QuestionRow[] = [];
  const corridor = await getActiveCorridor();
  let journey = await getCurriculum(corridor);
  let seeded = await isSeeded(corridor);
  let sources = await allSources();
  let corridors = await allCorridors();
  const corridorName = corridors.find((c) => c.slug === corridor)?.label ?? corridor;
  const languages = await allLanguages();
  let cta = await getCta();
  let dbError: string | null = null;
  try {
    [stats, queue, counts, leads, questions] = await Promise.all([ingestStats(), openQueue(), sourceChunkCounts(), listLeads(50), pendingQuestions()]);
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

      <div className="corridor-callout">
        <strong>Autopilot</strong>
        <p style={{ margin: "6px 0 10px", color: "var(--color-muted)" }}>
          Finishes ingestion, generates every not-yet-written topic, scores each, and
          auto-publishes high-scoring factual units. Interpretive units and weak drafts
          stay in the queue for you. Keep this tab open while it runs.
        </p>
        <AutopilotButton />
      </div>

      <CorridorBar corridors={corridors} active={corridor} />

      {/* 1 — Curriculum */}
      <h2>1 · Curriculum <span style={{ fontWeight: 400, color: "var(--color-faint)", fontSize: 15 }}>· {corridorName}</span></h2>
      <p style={{ color: "var(--color-muted)" }}>
        Each corridor has its own curriculum. Add, edit, remove, or ask AI to propose topics
        for <strong>{corridorName}</strong>. Generate writes a cited draft for a topic. Edits
        show up in this corridor&rsquo;s public navigation only.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0 18px", alignItems: "center" }}>
        {!seeded && (
          <ActionButton action={seedCurriculum} idleLabel={`Seed starter curriculum for ${corridorName}`} busyLabel="Seeding…" variant="primary" />
        )}
        <ActionButton action={recoverCurriculum} idleLabel="Recover content" busyLabel="Recovering…" />
        <ActionButton
          action={clearCurriculum}
          idleLabel="Clear all topics"
          busyLabel="Clearing…"
          confirm={`Delete every topic in the ${corridorName} curriculum? Generated content is kept and can be restored with Recover content.`}
        />
        <span style={{ color: "var(--color-faint)", fontSize: 13, flexBasis: "100%" }}>
          {seeded
            ? "Recover content rebuilds topics from any generated units that lost their topic (e.g. earlier deletions)."
            : `Seed loads the default starter topics for ${corridorName}. Recover content rebuilds topics from any existing generated units. You can change everything after.`}
        </span>
      </div>
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
      <h2 style={{ marginTop: 48 }}>
        2 · Ingest sources
        <a href="/admin/corpus" className="ghost-btn" style={{ fontSize: 13, marginLeft: 12, verticalAlign: "middle" }}>Corpus explorer</a>
      </h2>
      <p style={{ color: "var(--color-muted)" }}>
        {stats ? `${stats.sources} sources, ${stats.chunks} passages in the corpus.` : "—"} Ingest
        runs in small batches: click Ingest, and if pages remain, click again to continue.
        The writer can only cite what is in the corpus.
      </p>
      <AddSourceForm />
      <PdfUploadForm />
      <DiscoverPanel />
      <FreshnessButton sourceIds={sources.filter((s) => !s.id.startsWith("custom-pdf-")).map((s) => s.id)} />
      <SourcePanel
        sources={sources.map((s) => ({ id: s.id, body: s.body, custom: s.id.startsWith("custom-"), corridor: s.corridor }))}
      />

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
            <div className="table-scroll">
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
            </div>
          ) : (
            <p style={{ color: "var(--color-muted)", fontSize: 14, marginTop: 10 }}>
              No source-backed claims were extracted, usually because the relevant source
              was not ingested. Ingest the right source (section 2) and regenerate.
            </p>
          )}
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <ActionButton action={approveUnit.bind(null, row.unitId)} idleLabel="Approve & publish" busyLabel="Publishing…" variant="primary" />
            <a className="ghost-btn" href={`/admin/edit/${row.slug}`}>Edit content</a>
            <ActionButton action={rejectUnit.bind(null, row.unitId)} idleLabel="Reject" busyLabel="Rejecting…" />
          </div>
          <RegenerateBox slug={row.slug} />
          <div style={{ marginTop: 10 }}>
            <AssessButton slug={row.slug} />
          </div>
        </div>
      ))}

      {/* 4 — Leads from the chat funnel */}
      <h2 style={{ marginTop: 48 }}>4 · Leads ({leads.length})</h2>
      <p style={{ color: "var(--color-muted)" }}>
        People who asked the assistant to follow up. Reach out to convert them to a call.
      </p>
      {leads.length === 0 && <p style={{ color: "var(--color-faint)", fontSize: 14 }}>No leads yet.</p>}
      {leads.map((l) => (
        <div key={l.id} className="corridor-callout">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong>{l.name} · <a href={`mailto:${l.email}`}>{l.email}</a></strong>
            <span style={{ color: "var(--color-faint)", fontSize: 13 }}>{l.company} · {l.corridor} · {l.createdAt.slice(0, 10)}</span>
          </div>
          {l.question && <p style={{ margin: "8px 0 0", fontSize: 14 }}><em>Asked:</em> {l.question}</p>}
          {l.transcript && (
            <details className="draft-preview">
              <summary>Conversation</summary>
              <pre>{l.transcript}</pre>
            </details>
          )}
        </div>
      ))}

      {/* 5 — Reader questions */}
      <h2 style={{ marginTop: 48 }}>5 · Reader questions ({questions.length})</h2>
      <p style={{ color: "var(--color-muted)" }}>
        Questions visitors asked on a guide. Answer (AI-draft, then edit) and publish to
        append fresh Q&amp;A to that guide page.
      </p>
      {questions.length === 0 && <p style={{ color: "var(--color-faint)", fontSize: 14 }}>No pending questions.</p>}
      {questions.map((q) => (
        <QaReviewItem key={q.id} q={{ id: q.id, corridor: q.corridor, unitSlug: q.unitSlug, question: q.question, email: q.email }} />
      ))}

      {/* 6 — Languages */}
      <h2 style={{ marginTop: 48 }}>6 · Languages</h2>
      <p style={{ color: "var(--color-muted)" }}>
        Add a language and the public site gets a picker for it. Navigation and labels are
        AI-translated on demand; guide content is translated (and cached) the first time it is
        viewed in that language. English stays the authoritative version.
      </p>
      <LanguageManager languages={languages} />

      {/* 7 — Settings */}
      <h2 style={{ marginTop: 48 }}>7 · Settings</h2>
      <p style={{ color: "var(--color-muted)" }}>
        The booking CTA shown at the bottom of guides, cited in <code>/llms.txt</code>, and
        offered in the chat. Use your Calendly/booking URL when ready.
      </p>
      <CtaSettings label={cta.label} url={cta.url} />
    </div>
  );
}
