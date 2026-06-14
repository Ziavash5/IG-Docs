"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ingestAllStep,
  ingestSourceStep,
  clearSource,
  removeSource,
  corpusStatus,
  type SourceStatus,
} from "./actions";

type Step = { ok: boolean; done: boolean; message: string };
type S = { id: string; body: string; custom: boolean; corridor: string };

export function SourcePanel({ sources }: { sources: S[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"all" | "base" | "germany">("all");
  const [status, setStatus] = useState<Record<string, SourceStatus>>({});
  const stop = useRef(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const rows = await corpusStatus();
    setStatus(Object.fromEntries(rows.map((r) => [r.id, r])));
  }, []);

  // Initial load, plus a poll while running so progress updates without a refresh.
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [running, refresh]);

  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const loop = async (step: () => Promise<Step>) => {
    while (!stop.current) {
      let r: Step;
      try {
        r = await step();
      } catch {
        setMsg("A step stopped early (timeout). Use Continue unfinished to resume — nothing is lost.");
        break;
      }
      setMsg(r.message);
      await refresh();
      if (r.done || !r.ok) break;
      await new Promise((res) => setTimeout(res, 300));
    }
  };

  const drive = (fn: () => Promise<void>) => async () => {
    setRunning(true);
    stop.current = false;
    try {
      await fn();
    } finally {
      setRunning(false);
      await refresh();
      router.refresh();
    }
  };

  const list = sources
    .filter((s) => filter === "all" || s.corridor === filter)
    .map((s) => ({ ...s, st: status[s.id] }));
  const complete = list.filter((s) => s.st && s.st.pending === 0 && s.st.passages > 0).length;
  const pendingPages = list.reduce((a, s) => a + (s.st?.pending ?? 0), 0);

  return (
    <div>
      <div className="assist-bar" style={{ margin: "12px 0" }}>
        {running ? (
          <button type="button" className="ghost-btn" onClick={() => (stop.current = true)}>Stop</button>
        ) : (
          <>
            <button type="button" className="book-call-btn" onClick={drive(() => loop(() => ingestAllStep(false)))}>Ingest all (queued)</button>
            <button type="button" className="ghost-btn" onClick={drive(() => loop(() => ingestAllStep(true)))}>Continue unfinished</button>
            <button type="button" className="ghost-btn" disabled={sel.size === 0} onClick={drive(async () => {
              for (const id of sel) { if (stop.current) break; await loop(() => ingestSourceStep(id)); }
            })}>Ingest selected ({sel.size})</button>
          </>
        )}
      </div>

      <div className="assist-bar" style={{ margin: "0 0 8px" }}>
        <span style={{ fontSize: 12, color: "var(--color-faint)" }}>Show:</span>
        {(["all", "base", "germany"] as const).map((f) => (
          <button key={f} type="button" className="ghost-btn"
            style={filter === f ? { borderColor: "var(--color-brand)", color: "var(--color-brand)" } : undefined}
            onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "base" ? "Canada (base)" : "Germany (corridor)"}
          </button>
        ))}
      </div>
      <p style={{ color: "var(--color-muted)", fontSize: 14, margin: "0 0 6px" }}>
        {complete}/{list.length} sources complete · {pendingPages} pages pending
        {running && msg ? ` · ${msg}` : ""}
      </p>
      <p style={{ color: "var(--color-faint)", fontSize: 12, margin: "0 0 12px" }}>
        Progress is saved as it goes. Refreshing or leaving is safe — it only pauses the
        loop; click Continue unfinished to resume.
      </p>

      <ul className="source-list">
        {list.map((s) => {
          const p = s.st?.passages ?? 0;
          const pend = s.st?.pending ?? 0;
          const dot = pend > 0 ? "state-in_review" : p > 0 ? "state-published" : "state-planned";
          return (
            <li key={s.id} className="source-row">
              <div className="source-row-main">
                <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} disabled={running} style={{ marginTop: 3 }} />
                <div className="source-row-text">
                  <div className="source-row-title">{s.body}</div>
                  <div className="source-row-meta">
                    <span className={`corridor-tag ${s.corridor === "base" ? "is-base" : ""}`} title={s.corridor}>
                      {s.corridor === "base" ? "Canada (base)" : s.corridor}
                    </span>
                    <code className="source-row-id">{s.id}</code>
                    <span className="source-row-status">
                      <span className={`nav-dot ${dot}`} aria-hidden />
                      {p > 0 ? `${p} passages` : "not ingested"}{pend > 0 ? ` · ${pend} pending` : ""}
                    </span>
                  </div>
                </div>
              </div>
              <div className="source-row-actions">
                {!s.id.startsWith("custom-pdf-") && (
                  <>
                    <button className="ghost-btn" disabled={running} onClick={drive(() => loop(() => ingestSourceStep(s.id)))}>
                      {p > 0 ? "Continue" : "Ingest"}
                    </button>
                    <button className="ghost-btn" disabled={running} onClick={drive(async () => { await clearSource(s.id); await loop(() => ingestSourceStep(s.id)); })}>
                      Restart
                    </button>
                  </>
                )}
                {s.custom && (
                  <button className="ghost-btn" disabled={running} onClick={drive(async () => { await removeSource(s.id); await refresh(); })}>
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
