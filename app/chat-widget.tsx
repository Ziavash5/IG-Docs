"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { chat } from "./chat-actions";

type Msg = { role: "user" | "assistant"; content: string; sources?: string[]; suggestCall?: boolean };

const STARTERS = [
  "Do I need a Canadian subsidiary or can I run a branch?",
  "When does my German company owe GST/HST in Canada?",
  "How do I move an employee to our Canadian office?",
];

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, open]);

  if (pathname?.startsWith("/admin")) return null; // operator console doesn't need it

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await chat(next.map((m) => ({ role: m.role, content: m.content })));
      setMsgs((cur) => [...cur, { role: "assistant", content: r.answer, sources: r.sources, suggestCall: r.suggestCall }]);
    } catch {
      setMsgs((cur) => [...cur, { role: "assistant", content: "Something went wrong. Please try again.", suggestCall: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Ask a question">
          Ask about Canada
        </button>
      )}
      {open && (
        <div className="chat-panel" role="dialog" aria-label="InterGest Canada assistant">
          <div className="chat-head">
            <div>
              <strong>Ask InterGest Canada</strong>
              <p>Answers from official sources. For your specifics, we&rsquo;ll point you to a call.</p>
            </div>
            <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          <div className="chat-body">
            {msgs.length === 0 && (
              <div className="chat-starters">
                <p>Try:</p>
                {STARTERS.map((s) => (
                  <button key={s} className="chat-starter" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-bubble">{m.content}</div>
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div className="chat-sources">
                    {m.sources.map((s) => <span key={s} className="source-chip">{s}</span>)}
                  </div>
                )}
                {m.role === "assistant" && m.suggestCall && (
                  <a className="chat-cta" href="mailto:hello@intergest.ca?subject=Canada-entry%20call">
                    Book a 20-minute call →
                  </a>
                )}
              </div>
            ))}
            {busy && <div className="chat-msg assistant"><div className="chat-bubble chat-typing"><span></span><span></span><span></span></div></div>}
            <div ref={endRef} />
          </div>

          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" disabled={busy} />
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}
