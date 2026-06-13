"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ingestAllStep, ingestSourceStep, clearSource, removeSource } from "./actions";

type Step = { ok: boolean; done: boolean; message: string };
type S = { id: string; body: string; passages: number; custom: boolean };

export function SourcePanel({ sources }: { sources: S[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const stop = useRef(false);
  const router = useRouter();

  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const loop = async (step: () => Promise<Step>) => {
    let i = 0;
    while (!stop.current) {
      const r = await step();
      setMsg(r.message);
      if (++i % 3 === 0) router.refresh();
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
      router.refresh();
    }
  };

  const ingestAll = drive(() => loop(() => ingestAllStep(false)));
  const continueUnfinished = drive(() => loop(() => ingestAllStep(true)));
  const ingestSelected = drive(async () => {
    for (const id of sel) {
      if (stop.current) break;
      await loop(() => ingestSourceStep(id));
    }
  });

  return (
    <div>
      <div className="assist-bar" style={{ margin: "12px 0" }}>
        {running ? (
          <button type="button" className="ghost-btn" onClick={() => (stop.current = true)}>Stop</button>
        ) : (
          <>
            <button type="button" className="book-call-btn" onClick={ingestAll}>Ingest all (queued)</button>
            <button type="button" className="ghost-btn" onClick={continueUnfinished}>Continue unfinished</button>
            <button type="button" className="ghost-btn" disabled={sel.size === 0} onClick={ingestSelected}>
              Ingest selected ({sel.size})
            </button>
          </>
        )}
        {msg && <span className="action-msg ok">{running ? `Working… ${msg}` : msg}</span>}
      </div>

      <ul className="unit-list">
        {sources.map((s) => (
          <li key={s.id}>
            <div className="unit-link" style={{ cursor: "default" }}>
              <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} disabled={running} />
              <span className={`nav-dot ${s.passages > 0 ? "state-published" : "state-planned"}`} aria-hidden />
              <span className="source-chip">{s.id}</span>
              <span className="unit-link-q" style={{ fontSize: 14, flex: 1 }}>
                {s.body}
                <span style={{ color: "var(--color-faint)", marginLeft: 8 }}>
                  {s.passages > 0 ? `${s.passages} passages` : "not ingested"}
                </span>
              </span>
              <button className="ghost-btn" disabled={running} onClick={drive(() => loop(() => ingestSourceStep(s.id)))}>
                {s.passages > 0 ? "Continue" : "Ingest"}
              </button>
              <button className="ghost-btn" disabled={running} onClick={drive(async () => { await clearSource(s.id); await loop(() => ingestSourceStep(s.id)); })}>
                Restart
              </button>
              {s.custom && (
                <button className="ghost-btn" disabled={running} onClick={drive(async () => { await removeSource(s.id); })}>
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
