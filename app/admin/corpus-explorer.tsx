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

      {sources.length > 0 && <CorpusGraph sources={sources} onPick={(id) => { setSource(id); browse(0); }} />}

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

/** A radial node map of the corpus: center hub, source nodes sized by passage count,
 *  grouped into base (Canada) and corridor rings. Click a node to browse it. */
function CorpusGraph({ sources, onPick }: { sources: Src[]; onPick: (id: string) => void }) {
  const W = 760, H = 460, cx = 380, cy = 230;
  const base = sources.filter((s) => s.corridor === "base");
  const other = sources.filter((s) => s.corridor !== "base");
  const place = (arr: Src[], radius: number) =>
    arr.map((s, i) => {
      const ang = (i / Math.max(arr.length, 1)) * 2 * Math.PI - Math.PI / 2;
      return { ...s, x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) };
    });
  const nodes = [...place(base, 130), ...place(other, 200)];

  return (
    <div className="corpus-graph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="corpus-graph" role="img" aria-label="Knowledge graph of sources">
        {nodes.map((n) => (
          <line key={`l-${n.id}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="var(--color-line)" strokeWidth={1} />
        ))}
        <circle cx={cx} cy={cy} r={34} fill="var(--color-ink)" />
        <text x={cx} y={cy} textAnchor="middle" dy="0.35em" fill="#fff" fontSize={12} fontWeight={600}>Corpus</text>
        {nodes.map((n) => {
          const r = Math.max(11, Math.min(34, Math.sqrt(n.passages) * 2));
          return (
            <g key={n.id} className="graph-node" onClick={() => onPick(n.id)}>
              <title>{`${n.id} · ${n.passages} passages`}</title>
              <circle cx={n.x} cy={n.y} r={r} fill={n.corridor === "base" ? "#cfe9da" : "#ecd9bc"} stroke="var(--color-line)" />
              <text x={n.x} y={n.y} textAnchor="middle" dy="0.35em" fontSize={9} fontWeight={600}>{n.passages}</text>
              <text x={n.x} y={n.y + r + 11} textAnchor="middle" fontSize={9} fill="var(--color-muted)">
                {n.id.length > 16 ? `${n.id.slice(0, 15)}…` : n.id}
              </text>
            </g>
          );
        })}
      </svg>
      <p style={{ color: "var(--color-faint)", fontSize: 12, margin: "4px 0 0" }}>
        Green = Canada (base, shared). Tan = corridor. Node size = passages. Click a node to browse it.
      </p>
    </div>
  );
}
