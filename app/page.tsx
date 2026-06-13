import Link from "next/link";
import { journey, pathFor } from "@/lib/content";
import { BookCall } from "./components";

export default function Home() {
  return (
    <>
      <p className="eyebrow">InterGest Canada</p>
      <h1 className="accent-head" style={{ fontSize: 46 }}>
        The <strong>Art</strong> of Being <strong>Local</strong> in Canada
      </h1>
      <p className="lead">
        From company setup to daily operations and leadership — everything a foreign
        company needs to run in Canada and expand globally. Corridor-specific, and every
        factual claim tied to an official primary source.
      </p>

      <div className="corridor-callout">
        <strong>How it differs for your corridor</strong>
        <p style={{ margin: "8px 0 0" }}>
          Setting up in Canada has a materially different answer depending on where your
          company is from — tax-treaty treatment, immigration pathways, social-security
          totalization, and home-country tax consequences. We start with DACH (Germany,
          Austria, Switzerland); UK, USA, Australia, Japan, and India follow.
        </p>
      </div>

      <h2>Your journey, 0 to 100</h2>
      {journey.map((stage) => (
        <section key={stage.slug} className="stage-block">
          <p className="eyebrow" style={{ border: "none", paddingBottom: 0 }}>
            {stage.label}
          </p>
          <p className="lead" style={{ fontSize: 18 }}>
            {stage.tagline}
          </p>
          <div className="card-grid">
            {stage.pillars.map((p) => (
              <Link key={p.slug} href={pathFor(stage.slug, p.slug)} className="card">
                <span className="card-n">Pillar {p.n}</span>
                <h3>{p.title}</h3>
                <p className="card-service">{p.service}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <BookCall />
    </>
  );
}
