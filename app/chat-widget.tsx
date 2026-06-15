"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { saveLead } from "./chat-actions";
import { tr, type StringMap } from "@/lib/i18n-shared";

type Msg = { role: "user" | "assistant"; content: string; sources?: string[]; suggestCall?: boolean };

function inline(s: string) {
  return s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p));
}
function MD({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
      list = [];
    }
  };
  for (const ln of lines) {
    const t = ln.trim();
    if (t.startsWith("- ") || t.startsWith("* ")) list.push(t.slice(2));
    else { flush(); if (t) blocks.push(<p key={blocks.length}>{inline(t)}</p>); }
  }
  flush();
  return <>{blocks}</>;
}

const STARTERS = [
  "Do I need a Canadian subsidiary or can I run a branch?",
  "When does my German company owe GST/HST in Canada?",
  "How do I move an employee to our Canadian office?",
];

export default function ChatWidget({ dict }: { dict?: StringMap }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [lead, setLead] = useState({ name: "", email: "", company: "" });
  const [leadMsg, setLeadMsg] = useState("");
  const [leadDone, setLeadDone] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const submitLead = async () => {
    setLeadMsg(tr(dict, "Sending…"));
    const question = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const transcript = msgs.map((m) => `${m.role}: ${m.content}`).join("\n");
    const r = await saveLead({ ...lead, question, transcript });
    setLeadMsg(r.message);
    if (r.ok) { setLeadDone(true); setLeadOpen(false); }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, open]);

  if (pathname?.startsWith("/admin")) return null; // operator console doesn't need it

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const sources = (res.headers.get("x-chat-sources") ?? "").split(",").filter(Boolean);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const visible = acc.replace(/\[\[CALL\]\]/g, "").replace(/\s*—\s*/g, ", ").trimEnd();
        setMsgs((cur) => {
          const copy = [...cur];
          copy[copy.length - 1] = { role: "assistant", content: visible };
          return copy;
        });
      }
      const suggestCall = acc.includes("[[CALL]]");
      setMsgs((cur) => {
        const copy = [...cur];
        copy[copy.length - 1] = { role: "assistant", content: acc.replace(/\[\[CALL\]\]/g, "").replace(/\s*—\s*/g, ", ").trim(), sources, suggestCall };
        return copy;
      });
    } catch {
      setMsgs((cur) => {
        const copy = [...cur];
        copy[copy.length - 1] = { role: "assistant", content: tr(dict, "Something went wrong. Please try again."), suggestCall: true };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label={tr(dict, "Ask about Canada")}>
          {tr(dict, "Ask about Canada")}
        </button>
      )}
      {open && (
        <div className="chat-panel" role="dialog" aria-label="InterGest Canada assistant">
          <div className="chat-head">
            <div>
              <strong>{tr(dict, "Ask InterGest Canada")}</strong>
              <p>{tr(dict, "Answers from official sources. For your specifics, we'll point you to a call.")}</p>
            </div>
            <div className="chat-head-actions">
              {msgs.length > 0 && (
                <button className="chat-x" title={tr(dict, "New conversation")} aria-label={tr(dict, "New conversation")}
                  onClick={() => { setMsgs([]); setLeadOpen(false); setLeadDone(false); setLeadMsg(""); setInput(""); }}>
                  {tr(dict, "New")}
                </button>
              )}
              <button className="chat-x" onClick={() => setOpen(false)} aria-label={tr(dict, "Close")}>✕</button>
            </div>
          </div>

          <div className="chat-body">
            {msgs.length === 0 && (
              <div className="chat-starters">
                <p>{tr(dict, "Try:")}</p>
                {STARTERS.map((s) => (
                  <button key={s} className="chat-starter" onClick={() => send(s)}>{tr(dict, s)}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-bubble">
                  {m.role === "assistant"
                    ? (m.content === ""
                        ? <span className="chat-typing"><span></span><span></span><span></span></span>
                        : <MD text={m.content} />)
                    : m.content}
                </div>
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div className="chat-sources">
                    {m.sources.map((s) => <span key={s} className="source-chip">{s}</span>)}
                  </div>
                )}
                {m.role === "assistant" && m.suggestCall && !leadDone && (
                  <button className="chat-cta" onClick={() => setLeadOpen(true)}>
                    {tr(dict, "Get the answer for your company →")}
                  </button>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {leadOpen && (
            <div className="chat-lead">
              <strong>{tr(dict, "Get the specifics for your company")}</strong>
              <p>{tr(dict, "Leave your details and the InterGest Canada team will follow up with the answer for your situation. No obligation.")}</p>
              <input placeholder={tr(dict, "Name")} value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
              <input placeholder={tr(dict, "Work email")} value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
              <input placeholder={tr(dict, "Company")} value={lead.company} onChange={(e) => setLead({ ...lead, company: e.target.value })} />
              <div className="chat-lead-row">
                <button className="chat-lead-send" onClick={submitLead}>{tr(dict, "Send")}</button>
                <button className="chat-lead-cancel" onClick={() => setLeadOpen(false)}>{tr(dict, "Cancel")}</button>
                {leadMsg && <span className="chat-lead-msg">{leadMsg}</span>}
              </div>
            </div>
          )}
          {leadDone && <div className="chat-lead-done">✓ {tr(dict, "Thanks. We'll be in touch shortly.")}</div>}

          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={tr(dict, "Ask a question…")} disabled={busy} />
            <button type="submit" disabled={busy || !input.trim()}>{tr(dict, "Send")}</button>
          </form>
        </div>
      )}
    </>
  );
}
