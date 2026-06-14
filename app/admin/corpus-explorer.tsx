"use client";

import { useState } from "react";
import { corpusSearch, corpusBrowse, type Passage } from "./actions";

type Src = { id: string; body: string; corridor: string; passages: number };

export function CorpusExplorer({ sources }: { sources: Src[] }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [results, setResults] = useState<Passage[]>([]);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const labelFor = (id: string) => sources.find((s) => s.id === id);

  const search = async () => {
    setBusy(true);
    setNote("Searching…");
    try {
      const r = await corpusSearch(query, source || undefined);
      setResults(r);
      setNote(`${r.length} passages, ranked by relevance.`);
    } finally {
      setBusy(false);
    }
  };

  const browse = async (off: number) => {
    if (!source) return;
    setBusy(true);
    setNote("Loading…");
    try {
      const r = await corpusBrowse(source, off);
      setResults(r);
      setOffset(off);
      setNote(`Showing passages ${off + 1}–${off + r.length}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <p className="eyebrow">Corpus explorer</p>
      <h1 style={{ fontSize: 30 }}>See the data the AI pulls from</h1>
      <p className="lead" style={{ fontSize: 16 }}>
        Every passage here is what the writer is allowed to cite. Search semantically, or
        browse a single source, to verify what is grounding the content.
        <a href="/admin" className="ghost-btn" style={{ marginLeft: 10 }}>Back to console</a>
      </p>

      {sources.length > 0 && (
        <div className="corpus-map">
          {["base", ...Array.from(new Set(sources.map((s) => s.corridor))).filter((c) => c !== "base")].map((group) => {
            const inGroup = sources.filter((s) => s.corridor === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className="map-group">
                <p className="map-group-label">{group === "base" ? "Canada (base layer)" : `${group} (corridor)`}</p>
                <div className="map-bubbles">
                  {inGroup.map((s) => {
                    const size = Math.max(48, Math.min(124, 40 + Math.sqrt(s.passages) * 5));
                    return (
                      <button key={s.id} className={`map-bubble ${group === "base" ? "is-base" : "is-corridor"}`}
                        style={{ width: size, height: size }}
                        title={`${s.id} · ${s.passages} passages`}
                        onClick={() => { setSource(s.id); browse(0); }}>
                        <span className="map-bubble-n">{s.passages}</span>
                        <span className="map-bubble-id">{s.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="assist-bar" style={{ margin: "16px 0" }}>
        <input className="assist-input" placeholder="Search the corpus (e.g. GST small-supplier threshold)…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()} />
        <select className="corridor-select" style={{ width: "auto" }} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.id} ({s.passages})</option>
          ))}
        </select>
        <button className="book-call-btn" disabled={busy} onClick={search}>Search</button>
        {source && <button className="ghost-btn" disabled={busy} onClick={() => browse(0)}>Browse this source</button>}
      </div>
      {note && <p style={{ color: "var(--color-muted)", fontSize: 14 }}>{note}</p>}

      <ul className="unit-list">
        {results.map((p, i) => {
          const src = labelFor(p.sourceId);
          return (
            <li key={i} style={{ padding: "14px 4px", display: "block" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span className={`tier-chip ${src?.corridor === "base" ? "tier-factual" : "tier-interpretive"}`}>
                  {src?.corridor ?? "?"}
                </span>
                <span className="source-chip">{p.sourceId}</span>
                {p.score != null && <span style={{ color: "var(--color-faint)", fontSize: 12 }}>relevance {(p.score * 100).toFixed(0)}%</span>}
                <a href={p.locator} target="_blank" rel="noreferrer" style={{ fontSize: 12, marginLeft: "auto" }}>source ↗</a>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{p.text}</p>
            </li>
          );
        })}
      </ul>

      {source && !query && results.length > 0 && (
        <div className="assist-bar">
          <button className="ghost-btn" disabled={busy || offset === 0} onClick={() => browse(Math.max(0, offset - 25))}>Previous</button>
          <button className="ghost-btn" disabled={busy || results.length < 25} onClick={() => browse(offset + 25)}>Next</button>
        </div>
      )}
    </div>
  );
}
