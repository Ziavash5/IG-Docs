"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "./actions";
import { assessUnit } from "./actions";

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
