"use client";

import { useState, useTransition } from "react";
import { addTopic, editTopic, removeTopic, generateUnit, suggest, reorder, autoOrder, checkQuality } from "./actions";
import type { SuggestedTopic } from "@/lib/curriculum";

type Risk = "factual" | "interpretive";
type Topic = { slug: string; title: string; question: string; riskTier: Risk; state: string };

const stateLabel: Record<string, string> = {
  published: "live",
  in_review: "in review",
  planned: "not generated",
};

export function PillarEditor({
  stageSlug,
  pillarSlug,
  pillarTitle,
  service,
  units,
}: {
  stageSlug: string;
  pillarSlug: string;
  pillarTitle: string;
  service: string;
  units: Topic[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", question: "", riskTier: "factual" as Risk });
  const [add, setAdd] = useState({ title: "", question: "", riskTier: "factual" as Risk });
  const [suggestions, setSuggestions] = useState<SuggestedTopic[]>([]);
  const [adding, setAdding] = useState(false);
  const [assessment, setAssessment] = useState("");

  const slugs = units.map((u) => u.slug);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slugs.length) return;
    const next = [...slugs];
    [next[i], next[j]] = [next[j], next[i]];
    run(() => reorder(next));
  };

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, startMsg = "Working…") =>
    start(async () => {
      setMsg(startMsg);
      try {
        setMsg((await fn()).message);
      } catch {
        setMsg("Stopped early (timeout?). Try again.");
      }
    });

  const runSuggest = () =>
    start(async () => {
      setMsg("Thinking…");
      try {
        const r = await suggest(pillarTitle, service, units.map((u) => u.question));
        setSuggestions(r.suggestions);
        setMsg(r.ok ? `${r.suggestions.length} suggestions.` : `Failed: ${r.message}`);
      } catch {
        setMsg("Suggestion failed.");
      }
    });

  return (
    <div className="pillar-editor">
      <ul className="unit-list" style={{ margin: "4px 0" }}>
        {units.map((u, i) => (
          <li key={u.slug}>
            {editing === u.slug ? (
              <div className="topic-edit">
                <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Short label" />
                <textarea value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} placeholder="The question" rows={2} />
                <div className="topic-edit-row">
                  <select value={edit.riskTier} onChange={(e) => setEdit({ ...edit, riskTier: e.target.value as Risk })}>
                    <option value="factual">factual</option>
                    <option value="interpretive">interpretive</option>
                  </select>
                  <button className="ghost-btn" disabled={pending}
                    onClick={() => { run(() => editTopic(u.slug, edit)); setEditing(null); }}>Save</button>
                  <button className="ghost-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="unit-link" style={{ cursor: "default" }}>
                <span className="reorder">
                  <button className="reorder-btn" disabled={pending || i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
                  <button className="reorder-btn" disabled={pending || i === units.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
                </span>
                <span className={`nav-dot state-${u.state}`} aria-hidden />
                <span className={`tier-chip tier-${u.riskTier}`}>{u.riskTier}</span>
                <span className="unit-link-q" style={{ fontSize: 14, flex: 1 }}>
                  {u.question}
                  <span style={{ color: "var(--color-faint)", marginLeft: 8 }}>{stateLabel[u.state] ?? u.state}</span>
                </span>
                <button className="ghost-btn" disabled={pending} onClick={() => run(() => generateUnit(u.slug), `Generating “${u.title}” from sources… (up to a minute)`)}>
                  {pending ? "Working…" : "Generate"}
                </button>
                {u.state !== "planned" && (
                  <a className="ghost-btn" href={`/admin/edit/${u.slug}`}>Edit content</a>
                )}
                <button className="ghost-btn" onClick={() => { setEditing(u.slug); setEdit({ title: u.title, question: u.question, riskTier: u.riskTier }); }}>Rename</button>
                <button className="ghost-btn" disabled={pending} onClick={() => run(() => removeTopic(u.slug))}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="pillar-tools">
        <button className="ghost-btn" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "Add topic"}</button>
        <button className="ghost-btn" disabled={pending} onClick={runSuggest}>Suggest topics (AI)</button>
        <button className="ghost-btn" disabled={pending || units.length < 2} onClick={() => run(() => autoOrder(pillarSlug, pillarTitle))}>Auto-order (AI)</button>
        <button className="ghost-btn" disabled={pending} onClick={() =>
          start(async () => {
            setMsg("Reviewing…");
            const r = await checkQuality(pillarTitle, service, units.map((u) => u.question));
            if (r.ok && r.text) { setAssessment(r.text); setMsg(""); } else setMsg(r.message ?? "Failed.");
          })
        }>Check quality (AI)</button>
        {msg && <span className="action-msg ok">{msg}</span>}
      </div>

      {assessment && (
        <div className="assessment">
          <div className="assessment-head">
            <strong>Curriculum review</strong>
            <button className="reorder-btn" onClick={() => setAssessment("")} aria-label="Dismiss">✕</button>
          </div>
          <pre>{assessment}</pre>
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="suggest-list">
          {suggestions.map((s, i) => (
            <li key={i}>
              <span className={`tier-chip tier-${s.riskTier}`}>{s.riskTier}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{s.question}</span>
              <button className="ghost-btn" disabled={pending}
                onClick={() => {
                  run(() => addTopic(stageSlug, pillarSlug, { title: s.title, question: s.question, riskTier: s.riskTier }));
                  setSuggestions((cur) => cur.filter((_, j) => j !== i));
                }}>Add</button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="topic-edit" style={{ marginTop: 10 }}>
          <input value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="Short label (e.g. Director residency)" />
          <textarea value={add.question} onChange={(e) => setAdd({ ...add, question: e.target.value })} placeholder="The full question a customer would ask" rows={2} />
          <div className="topic-edit-row">
            <select value={add.riskTier} onChange={(e) => setAdd({ ...add, riskTier: e.target.value as Risk })}>
              <option value="factual">factual</option>
              <option value="interpretive">interpretive</option>
            </select>
            <button className="book-call-btn" disabled={pending}
              onClick={() => {
                run(() => addTopic(stageSlug, pillarSlug, add));
                setAdd({ title: "", question: "", riskTier: "factual" });
                setAdding(false);
              }}>Add topic</button>
          </div>
        </div>
      )}
    </div>
  );
}
