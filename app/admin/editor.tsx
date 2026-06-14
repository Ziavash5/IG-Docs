"use client";

import { useRef, useState, useTransition } from "react";
import { saveUnitBody, aiAssist, suggestEdits, type EditSuggestion } from "./actions";
import { AssessButton, RegenerateBox } from "./buttons";

/**
 * Content editor. Edit the body directly; have AI rewrite a selection or draft at the
 * cursor; or run a grounded "suggest improvements" pass that proposes precise, source-
 * backed edits you approve or reject one by one. Every AI edit is grounded only in the
 * unit's official source spans (see aiAssist / suggestEdits).
 */

type Placed = EditSuggestion & { status: "pending" | "applied" | "rejected"; note?: string };

// Find an anchor in the body: exact first, then whitespace-tolerant. Returns [start, end] or null.
function locate(body: string, anchor: string): [number, number] | null {
  const i = body.indexOf(anchor);
  if (i >= 0) return [i, i + anchor.length];
  const esc = anchor.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const m = new RegExp(esc).exec(body);
  return m ? [m.index, m.index + m[0].length] : null;
}

// Apply one suggestion to the body. Returns the new body and whether it placed cleanly.
function apply(body: string, s: EditSuggestion): { body: string; placed: boolean } {
  if (s.mode === "append_section") {
    return { body: `${body.trimEnd()}\n\n${s.newText.trim()}`, placed: true };
  }
  const span = locate(body, s.anchor);
  if (!span) {
    // Anchor drifted (the operator edited it away): append so nothing is lost.
    return { body: `${body.trimEnd()}\n\n${s.newText.trim()}`, placed: false };
  }
  const [start, end] = span;
  if (s.mode === "replace") {
    return { body: body.slice(0, start) + s.newText.trim() + body.slice(end), placed: true };
  }
  // insert_after
  return { body: body.slice(0, end) + "\n\n" + s.newText.trim() + body.slice(end), placed: true };
}

export function UnitEditor({ slug, question, initialBody }: { slug: string; question: string; initialBody: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody);
  const [instruction, setInstruction] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [suggesting, startSuggest] = useTransition();
  const [suggestions, setSuggestions] = useState<Placed[]>([]);
  const [suggestMsg, setSuggestMsg] = useState("");

  const save = () =>
    start(async () => {
      setMsg("Saving…");
      const r = await saveUnitBody(slug, body);
      setMsg(r.message);
    });

  const runAssist = (useSelection: boolean) => {
    const el = ref.current;
    if (!el) return;
    const start_ = el.selectionStart;
    const end_ = el.selectionEnd;
    const selected = useSelection ? body.slice(start_, end_) : "";
    if (useSelection && !selected) {
      setMsg("Select some text first, or use “Draft at cursor.”");
      return;
    }
    if (!instruction.trim()) {
      setMsg("Type an instruction for the AI first.");
      return;
    }
    start(async () => {
      setMsg("Writing from your sources…");
      const r = await aiAssist(slug, instruction, selected);
      if (!r.ok || !r.text) {
        setMsg(r.message ?? "Failed.");
        return;
      }
      const next = useSelection
        ? body.slice(0, start_) + r.text + body.slice(end_)
        : body.slice(0, start_) + (start_ > 0 ? "\n\n" : "") + r.text + body.slice(start_);
      setBody(next);
      setMsg("Inserted. Review it, then Save.");
    });
  };

  const runSuggest = () =>
    startSuggest(async () => {
      setSuggestMsg("Reading the draft and your sources…");
      setSuggestions([]);
      const r = await suggestEdits(slug);
      if (!r.ok || !r.suggestions) {
        setSuggestMsg(r.message ?? "Failed.");
        return;
      }
      if (r.suggestions.length === 0) {
        setSuggestMsg("No grounded gaps found — the draft already reflects the sources.");
        return;
      }
      setSuggestions(r.suggestions.map((s) => ({ ...s, status: "pending" as const })));
      setSuggestMsg(`${r.suggestions.length} grounded suggestion(s). Approve the ones you want.`);
    });

  const approve = (i: number) =>
    setSuggestions((cur) => {
      const s = cur[i];
      if (!s || s.status !== "pending") return cur;
      const { placed } = apply(body, s);
      setBody((b) => apply(b, s).body);
      const next = [...cur];
      next[i] = { ...s, status: "applied", note: placed ? undefined : "Anchor moved — added at the end instead." };
      return next;
    });

  const reject = (i: number) =>
    setSuggestions((cur) => {
      const next = [...cur];
      if (next[i]?.status === "pending") next[i] = { ...next[i], status: "rejected" };
      return next;
    });

  const modeLabel = (m: EditSuggestion["mode"]) =>
    m === "replace" ? "Tighten" : m === "append_section" ? "New section" : "Add detail";

  return (
    <div className="editor">
      <p className="card-n">Editing</p>
      <h1 style={{ fontSize: 26 }}>{question}</h1>

      <div className="assist-bar">
        <input
          className="assist-input"
          placeholder="Tell the AI what to write or change (it uses only your sources)…"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <button className="ghost-btn" disabled={pending} onClick={() => runAssist(true)}>Rewrite selection</button>
        <button className="ghost-btn" disabled={pending} onClick={() => runAssist(false)}>Draft at cursor</button>
      </div>

      <textarea
        ref={ref}
        className="editor-area"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={26}
        spellCheck
      />

      <div className="assist-bar" style={{ marginTop: 12 }}>
        <button className="book-call-btn" disabled={pending} onClick={save}>Save</button>
        <a className="ghost-btn" href="/admin">Back to console</a>
        {msg && <span className="action-msg ok">{msg}</span>}
      </div>
      <p style={{ color: "var(--color-faint)", fontSize: 13, marginTop: 10 }}>
        AI edits are written only from this unit&rsquo;s official sources. Saving updates the
        live page. Markdown: use <code>##</code> for headings and <code>-</code> for lists.
      </p>

      {/* ---- Grounded suggest-and-approve enhancement ---- */}
      <hr style={{ border: "none", borderTop: "1px solid var(--color-line)", margin: "24px 0" }} />
      <p className="card-n">Enhance from sources</p>
      <p style={{ color: "var(--color-muted)", fontSize: 14, margin: "4px 0 12px" }}>
        AI reads the whole draft against your ingested sources and proposes precise, source-backed
        edits for the specific details it is missing. Approve the ones you want; each one splices
        into the draft above. Nothing changes the live page until you Save.
      </p>
      <div className="assist-bar">
        <button className="book-call-btn" disabled={suggesting} onClick={runSuggest}>
          {suggesting ? "Thinking…" : "Suggest improvements (AI)"}
        </button>
        {suggestMsg && <span className="action-msg ok">{suggestMsg}</span>}
      </div>

      {suggestions.length > 0 && (
        <div style={{ margin: "16px 0 8px" }}>
          {suggestions.map((s, i) => (
            <div key={i} className={`suggest-edit is-${s.status}`}>
              <div className="suggest-edit-head">
                <span className={`tier-chip ${s.mode === "replace" ? "tier-interpretive" : "tier-factual"}`}>
                  {modeLabel(s.mode)}
                </span>
                <span className="suggest-edit-reason">{s.reason}</span>
              </div>
              {s.mode !== "append_section" && s.anchor.trim() && (
                <p className="suggest-edit-anchor">
                  {s.mode === "replace" ? "Replaces:" : "After:"} <em>“{s.anchor.trim()}”</em>
                </p>
              )}
              <div className="suggest-edit-new">{s.newText.trim()}</div>
              <div className="suggest-edit-foot">
                <div className="chat-sources">
                  {s.sourceIds.map((id) => (
                    <span key={id} className="source-chip">{id}</span>
                  ))}
                </div>
                {s.status === "pending" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ghost-btn" onClick={() => approve(i)}>Approve</button>
                    <button className="ghost-btn" onClick={() => reject(i)}>Reject</button>
                  </div>
                ) : (
                  <span className={`action-msg ${s.status === "applied" ? "ok" : "err"}`}>
                    {s.status === "applied" ? s.note ?? "Applied to the draft above." : "Rejected."}
                  </span>
                )}
              </div>
            </div>
          ))}
          <p style={{ color: "var(--color-faint)", fontSize: 13, marginTop: 8 }}>
            Approved edits are in the draft above. Review them, then click Save.
          </p>
        </div>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--color-line)", margin: "24px 0" }} />
      <p className="card-n">Regenerate or assess</p>
      <RegenerateBox slug={slug} />
      <p style={{ color: "var(--color-faint)", fontSize: 13, margin: "4px 0 14px" }}>
        Regenerating overwrites the body from the sources. Reload to see the new draft.
      </p>
      <AssessButton slug={slug} />
    </div>
  );
}
