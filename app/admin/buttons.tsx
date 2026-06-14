"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "./actions";
import { assessUnit, generateUnit, addSource, addPdfSource, ingestAllStep, autopilotStep } from "./actions";

/** Upload a PDF as a source (parsed and stored on the spot). */
export function PdfUploadForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button type="button" className="ghost-btn" onClick={() => setOpen(true)} style={{ margin: "8px 0 8px 8px" }}>
        Upload a PDF
      </button>
    );
  }
  return (
    <form ref={formRef} className="topic-edit" style={{ maxWidth: 620, margin: "8px 0 18px" }}
      action={(fd) => start(async () => {
        setMsg("Reading the PDF…");
        const r = await addPdfSource(fd);
        setMsg(r.message);
        if (r.ok) { formRef.current?.reset(); setOpen(false); }
      })}>
      <input className="assist-input" name="name" placeholder="Document name (e.g. Canada–Germany tax treaty)" />
      <input type="file" name="file" accept="application/pdf" />
      <div className="topic-edit-row">
        <select name="corridor" defaultValue="germany">
          <option value="base">Canada (base)</option>
          <option value="germany">Germany</option>
        </select>
        <button type="submit" className="book-call-btn" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
        <button type="button" className="ghost-btn" onClick={() => setOpen(false)}>Cancel</button>
        {msg && <span className="action-msg ok">{msg}</span>}
      </div>
    </form>
  );
}

/** One-click end-to-end: finish ingestion, generate every topic, self-assess, publish. */
export function AutopilotButton() {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const stop = useRef(false);
  const router = useRouter();

  const run = async () => {
    setRunning(true);
    stop.current = false;
    let steps = 0;
    try {
      while (!stop.current) {
        let r;
        try {
          r = await autopilotStep();
        } catch {
          setMsg("A step stopped early (timeout). Click Run autopilot again to resume.");
          break;
        }
        setMsg(r.message);
        if (++steps % 3 === 0) router.refresh();
        if (r.done || !r.ok) break;
        await new Promise((res) => setTimeout(res, 300));
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  return (
    <div className="assist-bar">
      {running ? (
        <button type="button" className="ghost-btn" onClick={() => (stop.current = true)}>Stop autopilot</button>
      ) : (
        <button type="button" className="book-call-btn" onClick={run}>Run autopilot</button>
      )}
      {msg && <span className="action-msg ok">{running ? `Working… ${msg}` : msg}</span>}
    </div>
  );
}

/** Ingest the whole corpus by looping the queue one batch at a time (with Stop). */
export function IngestAllButton() {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const stop = useRef(false);
  const router = useRouter();

  const run = async () => {
    setRunning(true);
    stop.current = false;
    let steps = 0;
    try {
      while (!stop.current) {
        const r = await ingestAllStep();
        setMsg(r.message);
        if (++steps % 3 === 0) router.refresh();
        if (r.done || !r.ok) break;
        await new Promise((res) => setTimeout(res, 300));
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  return (
    <div className="assist-bar" style={{ margin: "12px 0" }}>
      {running ? (
        <button type="button" className="ghost-btn" onClick={() => (stop.current = true)}>Stop</button>
      ) : (
        <button type="button" className="book-call-btn" onClick={run}>Ingest all (queued)</button>
      )}
      {msg && <span className="action-msg ok">{running ? `Working… ${msg}` : msg}</span>}
    </div>
  );
}

/** Add your own official source by URL. */
export function AddSourceForm() {
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [corridor, setCorridor] = useState("base");
  const [crawl, setCrawl] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="ghost-btn" onClick={() => setOpen(true)} style={{ margin: "8px 0" }}>
        Add a source
      </button>
    );
  }
  return (
    <div className="topic-edit" style={{ maxWidth: 620, margin: "8px 0 18px" }}>
      <input className="assist-input" placeholder="Source name (e.g. CRA — Importing goods)" value={body} onChange={(e) => setBody(e.target.value)} />
      <input className="assist-input" placeholder="https://… official page URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="topic-edit-row">
        <select value={corridor} onChange={(e) => setCorridor(e.target.value)}>
          <option value="base">Canada (base, all corridors)</option>
          <option value="germany">Germany</option>
        </select>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={crawl} onChange={(e) => setCrawl(e.target.checked)} /> crawl sub-pages
        </label>
        <button className="book-call-btn" disabled={pending} onClick={() =>
          start(async () => {
            setMsg("Adding…");
            const r = await addSource({ body, url, corridor, crawl });
            setMsg(r.message);
            if (r.ok) { setBody(""); setUrl(""); setOpen(false); }
          })
        }>Add</button>
        <button className="ghost-btn" onClick={() => setOpen(false)}>Cancel</button>
        {msg && <span className="action-msg ok">{msg}</span>}
      </div>
    </div>
  );
}

/**
 * Runs a (bound) server action with visible pending + result state. A 60s Vercel Hobby
 * timeout surfaces here as a failed result instead of silently doing nothing.
 */
export function ActionButton({
  action,
  idleLabel,
  busyLabel,
  variant = "ghost",
}: {
  action: () => Promise<ActionResult>;
  idleLabel: string;
  busyLabel: string;
  variant?: "ghost" | "primary";
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult | null>(null);

  return (
    <span className="action-cell">
      <button
        type="button"
        className={variant === "primary" ? "book-call-btn" : "ghost-btn"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setRes(null);
            try {
              setRes(await action());
            } catch (e) {
              setRes({
                ok: false,
                message:
                  "Stopped before finishing (often a 60s timeout on Hobby). Check Vercel logs.",
              });
            }
          })
        }
      >
        {pending ? busyLabel : idleLabel}
      </button>
      {res && <span className={`action-msg ${res.ok ? "ok" : "err"}`}>{res.message}</span>}
    </span>
  );
}

/** Regenerate a unit from its sources with an operator instruction. */
export function RegenerateBox({ slug }: { slug: string }) {
  const [instruction, setInstruction] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  return (
    <div className="assist-bar" style={{ marginTop: 10 }}>
      <input
        className="assist-input"
        placeholder="Regenerate with an instruction (e.g. lead with the small-supplier threshold)…"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <button
        type="button"
        className="ghost-btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg("Regenerating from sources…");
            try {
              setMsg((await generateUnit(slug, instruction || undefined)).message);
            } catch {
              setMsg("Failed (timeout?).");
            }
          })
        }
      >
        {pending ? "Regenerating…" : "Regenerate"}
      </button>
      {msg && <span className="action-msg ok">{msg}</span>}
    </div>
  );
}

/** Runs the AI value assessment for a unit and shows the score + findings. */
export function AssessButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ score?: number; text?: string; message?: string } | null>(null);

  return (
    <div className="assess">
      <button
        type="button"
        className="ghost-btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setRes(null);
            try {
              setRes(await assessUnit(slug));
            } catch {
              setRes({ message: "Failed (timeout?)." });
            }
          })
        }
      >
        {pending ? "Assessing…" : "Assess value (AI)"}
      </button>
      {res && (res.text || res.message) && (
        <div className="assessment" style={{ marginTop: 10 }}>
          {res.score != null && <strong>Value score: {res.score}/5</strong>}
          <pre>{res.text ?? res.message}</pre>
        </div>
      )}
    </div>
  );
}
