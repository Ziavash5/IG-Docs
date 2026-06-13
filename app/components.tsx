/** Shared presentational components for the public corpus. */

/**
 * The conversion CTA on every page — the inbound-funnel mechanism. Interpretive units
 * route here by construction; this is where high-value services convert.
 */
export function BookCall() {
  return (
    <div className="book-call" id="book">
      <div>
        <strong>Considering Canada?</strong>
        <p style={{ margin: "4px 0 0", color: "var(--color-muted)" }}>
          Your structure, tax position, and timeline are decided on a call — not a form.
        </p>
      </div>
      <a className="book-call-btn" href="mailto:hello@intergest.ca?subject=Canada-entry%20call">
        Book a 20-minute call
      </a>
    </div>
  );
}
