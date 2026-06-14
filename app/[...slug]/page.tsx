import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pathFor, findUnit as findStaticUnit, type Stage, type UnitEntry } from "@/lib/content";
import { getCurriculum, unitContent } from "@/lib/curriculum";
import type { PublicUnit } from "@/lib/db";
import { BookCall } from "../components";

export const dynamic = "force-dynamic";

type Params = { slug: string[] };

function resolve(journey: Stage[], slug: string[]) {
  const stage = journey.find((s) => s.slug === slug[0]);
  if (!stage) return null;
  if (slug.length === 1) return { kind: "stage" as const, stage };
  const pillar = stage.pillars.find((p) => p.slug === slug[1]);
  if (!pillar) return null;
  if (slug.length === 2) return { kind: "pillar" as const, stage, pillar };
  const unit = pillar.units.find((u) => u.slug === slug[2]);
  if (!unit) return null;
  return { kind: "unit" as const, stage, pillar, unit };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const corridor = slug[0];
  const r = resolve(await getCurriculum(corridor), slug.slice(1));
  if (!r) return { title: "InterGest Canada" };
  const canonical = `/${slug.join("/")}`;
  if (r.kind === "unit") {
    const c = await unitContent(corridor, r.unit.slug);
    const desc = (c?.body?.replace(/[#*>\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 155)) ||
      `${r.unit.question} For a German company expanding to Canada, with official sources.`;
    return { title: `${r.unit.question} — InterGest Canada`, description: desc, alternates: { canonical } };
  }
  if (r.kind === "pillar")
    return { title: `${r.pillar.title} — InterGest Canada`, description: r.pillar.blurb, alternates: { canonical } };
  return { title: `${r.stage.label} — InterGest Canada`, description: r.stage.tagline, alternates: { canonical } };
}

const riskLabel = (tier: string) =>
  tier === "interpretive" ? "Decided on a call" : "Source-verified";

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const corridor = slug[0];
  const journey = await getCurriculum(corridor);
  const r = resolve(journey, slug.slice(1));
  if (!r) notFound();

  if (r.kind === "stage") return <StageView corridor={corridor} stage={r.stage} />;
  if (r.kind === "pillar") return <PillarView corridor={corridor} stage={r.stage} pillar={r.pillar} />;

  const content = await unitContent(corridor, r.unit.slug);
  return <UnitView stageLabel={r.stage.label}
    pillarTitle={r.pillar.title} pillarN={r.pillar.n} unit={r.unit} content={content} />;
}

// ---- Markdown (minimal, for generated bodies) -------------------------------

function mdInline(s: string) {
  return s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p));
}
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) return <h2 key={i}>{mdInline(b.slice(3))}</h2>;
        if (b.startsWith("### ")) return <h3 key={i}>{mdInline(b.slice(4))}</h3>;
        const lines = b.split("\n");
        if (lines.every((l) => l.startsWith("> ")))
          return <blockquote key={i} className="md-callout">{mdInline(lines.map((l) => l.slice(2)).join(" "))}</blockquote>;
        if (lines.every((l) => l.startsWith("- ")))
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{mdInline(l.slice(2))}</li>)}</ul>;
        return <p key={i}>{mdInline(b)}</p>;
      })}
    </>
  );
}

// ---- Stage landing ----------------------------------------------------------

function StageView({ corridor, stage }: { corridor: string; stage: Stage }) {
  return (
    <>
      <p className="eyebrow">{stage.label}</p>
      <h1 style={{ fontSize: 40 }}>{stage.tagline}</h1>
      <div className="card-grid">
        {stage.pillars.map((p) => (
          <Link key={p.slug} href={pathFor(corridor, stage.slug, p.slug)} className="card">
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

// ---- Pillar landing ---------------------------------------------------------

function PillarView({ corridor, stage, pillar }: { corridor: string; stage: Stage; pillar: Stage["pillars"][number] }) {
  return (
    <>
      <p className="eyebrow">{stage.label} · Pillar {pillar.n}</p>
      <h1 style={{ fontSize: 38 }}>{pillar.title}</h1>
      <p className="lead">{pillar.blurb}</p>
      <p className="card-service" style={{ marginTop: -8 }}>InterGest service: {pillar.service}</p>
      <ul className="unit-list">
        {pillar.units.map((u) => (
          <li key={u.slug}>
            <Link href={pathFor(corridor, stage.slug, pillar.slug, u.slug)} className="unit-link">
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

// ---- Unit reading experience ------------------------------------------------

function UnitView({
  stageLabel, pillarTitle, pillarN, unit, content,
}: {
  stageLabel: string;
  pillarTitle: string; pillarN: number; unit: UnitEntry; content: PublicUnit | null;
}) {
  // Prefer generated content from the DB; otherwise fall back to the in-code exemplar.
  const exemplar = findStaticUnit("enter", "decide-structure", unit.slug)?.unit.content;
  const hasGenerated = content?.body && content.status !== "planned";

  const badge =
    content?.status === "published"
      ? "Published"
      : hasGenerated
      ? "In review · pending source verification"
      : exemplar
      ? "In review · pending source verification"
      : "In production";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(content?.lastReviewed ? { dateModified: content.lastReviewed } : {}),
    ...(content?.author ? { author: { "@type": "Person", name: content.author, jobTitle: content.credentials ?? undefined } } : {}),
    mainEntity: [
      {
        "@type": "Question",
        name: unit.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: hasGenerated ? content!.body!.slice(0, 500) : exemplar?.directAnswer ?? "",
        },
      },
    ],
  };

  return (
    <article>
      <p className="eyebrow">{stageLabel} · Pillar {pillarN} · {pillarTitle}</p>
      <div className="unit-head">
        <h1 style={{ fontSize: 34 }}>{unit.question}</h1>
        <span className={`status-badge state-${content?.status === "published" ? "published" : hasGenerated || exemplar ? "in_review" : "planned"}`}>
          {badge}
        </span>
      </div>
      {hasGenerated && (content!.lastReviewed || content!.author) && (
        <p className="reviewed-meta">
          Last reviewed {content!.lastReviewed ?? "recently"}
          {content!.author ? ` by ${content!.author}${content!.credentials ? `, ${content!.credentials}` : ""}` : ""}.
        </p>
      )}

      {hasGenerated ? (
        <>
          <Markdown text={content!.body!} />
          {content!.citations.length > 0 && (
            <div className="citations">
              <span className="citations-label">Sources</span>
              {content!.citations.map((id) => (
                <span key={id} className="source-chip">{id}</span>
              ))}
            </div>
          )}
          <div className="trust-strip">
            {content!.author && (
              <>Reviewed by {content!.author}{content!.credentials ? `, ${content!.credentials}` : ""}.<br /></>
            )}
            General information, not advice. Your specific situation is decided on a call.
            <br />
            Last reviewed: {content!.lastReviewed ?? "pending"}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        </>
      ) : exemplar ? (
        <>
          <p className="direct-answer">{exemplar.directAnswer}</p>
          {exemplar.sections.map((s) => (
            <section key={s.heading}><h2>{s.heading}</h2><p>{s.body}</p></section>
          ))}
          {exemplar.corridorDelta && (
            <div className="corridor-callout">
              <strong>How it differs for a German company</strong>
              <p style={{ margin: "8px 0 0" }}>{exemplar.corridorDelta}</p>
            </div>
          )}
          {exemplar.checklist && (
            <>
              <h2>Checklist</h2>
              <ul className="checklist">{exemplar.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          <div className="trust-strip">
            General information, not advice. Your specific situation is decided on a call.
            <br />
            Last reviewed: 2026-06-13
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        </>
      ) : (
        <div className="in-production">
          <p className="lead">
            We are still writing this one. When it is ready it will answer{" "}
            <strong>“{unit.question}”</strong> for your corridor, with every fact tied back
            to the official source it came from.
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
