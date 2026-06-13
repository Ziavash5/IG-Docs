import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  journey,
  findStage,
  findPillar,
  findUnit,
  allUnitParams,
  pathFor,
  type UnitEntry,
} from "@/lib/content";
import { BookCall } from "../components";

type Params = { slug: string[] };

export function generateStaticParams() {
  const params: Params[] = [];
  for (const s of journey) {
    params.push({ slug: [s.slug] });
    for (const p of s.pillars) {
      params.push({ slug: [s.slug, p.slug] });
      for (const u of p.units) params.push({ slug: [s.slug, p.slug, u.slug] });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug.length === 3) {
    const found = findUnit(slug[0], slug[1], slug[2]);
    if (found) return { title: `${found.unit.question} — InterGest Canada` };
  }
  if (slug.length === 2) {
    const found = findPillar(slug[0], slug[1]);
    if (found) return { title: `${found.pillar.title} — InterGest Canada` };
  }
  const stage = findStage(slug[0]);
  return { title: stage ? `${stage.label} — InterGest Canada` : "InterGest Canada" };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  if (slug.length === 3) return <UnitView a={slug[0]} b={slug[1]} c={slug[2]} />;
  if (slug.length === 2) return <PillarView a={slug[0]} b={slug[1]} />;
  if (slug.length === 1) return <StageView a={slug[0]} />;
  notFound();
}

function riskLabel(tier: string) {
  return tier === "interpretive" ? "Decided on a call" : "Source-verified";
}

// ---- Stage landing -----------------------------------------------------------

function StageView({ a }: { a: string }) {
  const stage = findStage(a);
  if (!stage) notFound();
  return (
    <>
      <p className="eyebrow">{stage.label}</p>
      <h1 style={{ fontSize: 40 }}>{stage.tagline}</h1>
      <div className="card-grid">
        {stage.pillars.map((p) => (
          <Link key={p.slug} href={pathFor(stage.slug, p.slug)} className="card">
            <span className="card-n">Pillar {p.n}</span>
            <h3>{p.title}</h3>
            <p className="card-service">{p.service}</p>
            <p>{p.blurb}</p>
          </Link>
        ))}
      </div>
      <BookCall />
    </>
  );
}

// ---- Pillar landing ----------------------------------------------------------

function PillarView({ a, b }: { a: string; b: string }) {
  const found = findPillar(a, b);
  if (!found) notFound();
  const { stage, pillar } = found;
  return (
    <>
      <p className="eyebrow">
        {stage.label} · Pillar {pillar.n}
      </p>
      <h1 style={{ fontSize: 38 }}>{pillar.title}</h1>
      <p className="lead">{pillar.blurb}</p>
      <p className="card-service" style={{ marginTop: -8 }}>
        InterGest service: {pillar.service}
      </p>
      <ul className="unit-list">
        {pillar.units.map((u) => (
          <li key={u.slug}>
            <Link href={pathFor(stage.slug, pillar.slug, u.slug)} className="unit-link">
              <span className={`nav-dot state-${u.state}`} aria-hidden />
              <span className="unit-link-q">{u.question}</span>
              <span className={`tier-chip tier-${u.riskTier}`}>{riskLabel(u.riskTier)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <BookCall />
    </>
  );
}

// ---- Unit reading experience -------------------------------------------------

function StatusBadge({ unit }: { unit: UnitEntry }) {
  const map: Record<string, string> = {
    published: "Published",
    in_review: "In review · pending source verification",
    planned: "In production",
  };
  return <span className={`status-badge state-${unit.state}`}>{map[unit.state]}</span>;
}

function UnitView({ a, b, c }: { a: string; b: string; c: string }) {
  const found = findUnit(a, b, c);
  if (!found) notFound();
  const { stage, pillar, unit } = found;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: unit.question,
        acceptedAnswer: { "@type": "Answer", text: unit.content?.directAnswer ?? "" },
      },
    ],
  };

  return (
    <article>
      <p className="eyebrow">
        {stage.label} · Pillar {pillar.n} · {pillar.title}
      </p>
      <div className="unit-head">
        <h1 style={{ fontSize: 34 }}>{unit.question}</h1>
        <StatusBadge unit={unit} />
      </div>

      {unit.content ? (
        <>
          <p className="direct-answer">{unit.content.directAnswer}</p>

          {unit.content.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </section>
          ))}

          {unit.content.corridorDelta && (
            <div className="corridor-callout">
              <strong>How it differs for your corridor (DACH)</strong>
              <p style={{ margin: "8px 0 0" }}>{unit.content.corridorDelta}</p>
            </div>
          )}

          {unit.content.checklist && (
            <>
              <h2>Checklist</h2>
              <ul className="checklist">
                {unit.content.checklist.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </>
          )}

          {unit.citations && (
            <div className="citations">
              <span className="citations-label">Sources</span>
              {unit.citations.map((id) => (
                <span key={id} className="source-chip">
                  {id}
                </span>
              ))}
            </div>
          )}

          <div className="trust-strip">
            General information, not advice. Your specific situation is decided on a call.
            <br />
            Author: pending byline + credentials · Last reviewed: 2026-06-13
          </div>

          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </>
      ) : (
        <div className="in-production">
          <p className="lead">
            We are still writing this one. When it is ready it will answer{" "}
            <strong>“{unit.question}”</strong> for your corridor, with every fact tied
            back to the official source it came from.
          </p>
          <p className="card-service">{riskLabel(unit.riskTier)}</p>
          <p style={{ margin: "8px 0 0" }}>
            Need the answer for your situation now? A short call is the fastest way.
          </p>
        </div>
      )}

      <BookCall />
    </article>
  );
}
