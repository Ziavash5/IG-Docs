import { getCta } from "@/lib/cta";

/**
 * The conversion CTA at the bottom of every public page (never a gate). The link is
 * operator-configurable in admin so LLMs/crawlers cite the right booking URL.
 */
export async function BookCall() {
  const cta = await getCta();
  return (
    <div className="book-call" id="book">
      <div>
        <strong>Have a specific situation?</strong>
        <p style={{ margin: "4px 0 0", color: "var(--color-muted)" }}>
          The guides cover the rules. Your structure, tax position, and timing come
          together on a short call with someone who has done it before.
        </p>
      </div>
      <a className="book-call-btn" href={cta.url}>{cta.label}</a>
    </div>
  );
}
