"use client";

import { useRef, useState, useTransition } from "react";
import { saveUnitBody, aiAssist } from "./actions";
import { AssessButton, RegenerateBox } from "./buttons";

/**
 * Content editor. Edit the body directly, or select a passage and have AI rewrite it,
 * or place the cursor and have AI draft a passage. Every AI edit is grounded only in the
 * unit's official source spans (see aiAssist).
 */
export function UnitEditor({ slug, question, initialBody }: { slug: string; question: string; initialBody: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody);
  const [instruction, setInstruction] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

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
