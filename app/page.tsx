export default function Home() {
  return (
    <>
      <p className="eyebrow">InterGest Canada</p>
      <h1 className="accent-head" style={{ fontSize: 44 }}>
        The <strong>Art</strong> of Being <strong>Local</strong> in Canada
      </h1>
      <p style={{ fontSize: 20, color: "var(--color-muted)", maxWidth: 620 }}>
        From company setup to daily operations and leadership — everything a foreign
        company needs to run in Canada and expand globally.
      </p>

      <h2 style={{ marginTop: 48 }}>Corridor-specific, source-grounded answers</h2>
      <p>
        Setting up in Canada has a materially different answer depending on where your
        company is from. This hub answers the narrow, corridor-specific questions
        completely — every factual claim wired to an official primary source, with a
        visible last-reviewed date and a named author.
      </p>

      <div className="corridor-callout">
        <strong>How it differs for your corridor</strong>
        <p style={{ margin: "8px 0 0" }}>
          Tax-treaty treatment, immigration pathways, social-security totalization, and
          home-country tax consequences differ by source country. We start with DACH
          (Germany, Austria, Switzerland), then UK, USA, Australia, New Zealand, Japan,
          and India.
        </p>
      </div>

      <p style={{ color: "var(--color-muted)", fontSize: 14 }}>
        General information, not advice. Your specific situation is decided on a call.
      </p>
    </>
  );
}
