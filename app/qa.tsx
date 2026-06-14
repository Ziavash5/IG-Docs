"use client";

import { useState, useTransition } from "react";
import { submitQuestion } from "./qa-actions";

/** "Ask our desk" block at the bottom of each guide (the user-generated Q&A loop). */
export function AskDesk({ corridor, unitSlug }: { corridor: string; unitSlug: string }) {
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  if (done) return <div className="askdesk"><p className="askdesk-done">✓ {msg}</p></div>;

  return (
    <div className="askdesk">
      <strong>Have a specific question about this?</strong>
      <p>Ask our desk. We answer directly, and add broadly useful questions to this guide.</p>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="Your question about this topic…" />
      <div className="askdesk-row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional, for a direct reply)" />
        <button className="book-call-btn" disabled={pending} onClick={() =>
          start(async () => {
            const r = await submitQuestion({ corridor, unitSlug, question, email });
            setMsg(r.message);
            if (r.ok) setDone(true);
          })
        }>{pending ? "Sending…" : "Ask"}</button>
      </div>
      {msg && !done && <span className="action-msg ok">{msg}</span>}
    </div>
  );
}
