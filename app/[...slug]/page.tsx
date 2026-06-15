import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pathFor, findUnit as findStaticUnit, type Stage, type UnitEntry } from "@/lib/content";
import { getCurriculum, unitContent } from "@/lib/curriculum";
import type { PublicUnit } from "@/lib/db";
import { publishedQuestions } from "@/lib/db";
import { BookCall } from "../components";
import { LiveData } from "../live-data";
import { AskDesk } from "../qa";
import { getLang, getDict, translateDoc } from "@/lib/i18n";
import { tr, type StringMap } from "@/lib/i18n-shared";

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
  const lang = await getLang();
  const [journey, dict] = await Promise.all([getCurriculum(corridor), getDict(lang)]);
  const r = resolve(journey, slug.slice(1));
  if (!r) notFound();

  if (r.kind === "stage") return <StageView corridor={corridor} stage={r.stage} dict={dict} />;
  if (r.kind === "pillar") return <PillarView corridor={corridor} stage={r.stage} pillar={r.pillar} dict={dict} />;

  const content = await unitContent(corridor, r.unit.slug);
  const qa = await publishedQuestions(corridor, r.unit.slug).catch(() => []);
  // Translate the long content on demand (cached); chrome + nav strings come from `dict`.
  const translatedBody = content?.body ? await translateDoc(lang, content.body) : content?.body ?? null;
  const translatedQa = await Promise.all(
    qa.map(async (q) => ({ question: tr(dict, q.question), answer: await translateDoc(lang, q.answer) })),
  );
  return <UnitView stageLabel={r.stage.label} corridor={corridor} unitSlug={r.unit.slug} qa={translatedQa}
    pillarTitle={r.pillar.title} pillarN={r.pillar.n} unit={r.unit} content={content}
    body={translatedBody} dict={dict} lang={lang} />;
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

function StageView({ corridor, stage, dict }: { corridor: string; stage: Stage; dict: StringMap }) {
  return (
    <>
      <p className="eyebrow">{tr(dict, stage.label)}</p>
      <h1 style={{ fontSize: 40 }}>{tr(dict, stage.tagline)}</h1>
      <div className="card-grid">
        {stage.pillars.map((p) => (
          <Link key={p.slug} href={pathFor(corridor, stage.slug, p.slug)} className="card">
            <span className="card-n">Pillar {p.n}</span>
            <h3>{tr(dict, p.title)}</h3>
            <p className="card-service">{tr(dict, p.service)}</p>
            <p>{tr(dict, p.blurb)}</p>
          </Link>
        ))}
      </div>
      <BookCall />
    </>
  );
}

// ---- Pillar landing ---------------------------------------------------------

function PillarView({ corridor, stage, pillar, dict }: { corridor: string; stage: Stage; pillar: Stage["pillars"][number]; dict: StringMap }) {
  return (
    <>
      <p className="eyebrow">{tr(dict, stage.label)} · Pillar {pillar.n}</p>
      <h1 style={{ fontSize: 38 }}>{tr(dict, pillar.title)}</h1>
      <p className="lead">{tr(dict, pillar.blurb)}</p>
      <ul className="unit-list">
        {pillar.units.map((u) => (
          <li key={u.slug}>
            <Link href={pathFor(corridor, stage.slug, pillar.slug, u.slug)} className="unit-link">
              <span className={`nav-dot state-${u.state}`} aria-hidden />
              <span className="unit-link-q">{tr(dict, u.question)}</span>
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
  stageLabel, pillarTitle, pillarN, unit, content, corridor, unitSlug, qa, body, dict, lang,
}: {
  stageLabel: string; corridor: string; unitSlug: string;
  qa: { question: string; answer: string }[];
  pillarTitle: string; pillarN: number; unit: UnitEntry; content: PublicUnit | null;
  body: string | null; dict: StringMap; lang: string;
}) {
  const translated = lang !== "en";
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
      ...qa.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: { "@type": "Answer", text: q.answer.slice(0, 500) },
      })),
    ],
  };

  return (
    <article>
      <p className="eyebrow">{tr(dict, stageLabel)} · Pillar {pillarN} · {tr(dict, pillarTitle)}</p>
      <div className="unit-head">
        <h1 style={{ fontSize: 34 }}>{tr(dict, unit.question)}</h1>
        <span className={`status-badge state-${content?.status === "published" ? "published" : hasGenerated || exemplar ? "in_review" : "planned"}`}>
          {badge}
        </span>
      </div>
      {hasGenerated && (content!.lastReviewed || content!.author) && (
        <p className="reviewed-meta">
          {tr(dict, "Last reviewed")} {content!.lastReviewed ?? "recently"}
          {content!.author ? ` by ${content!.author}${content!.credentials ? `, ${content!.credentials}` : ""}` : ""}.
        </p>
      )}
      {hasGenerated && translated && (
        <p className="translated-note">{tr(dict, "Machine-translated for convenience. The English version is authoritative.")}</p>
      )}
      {hasGenerated && <LiveData corridor={corridor} />}

      {hasGenerated ? (
        <>
          <Markdown text={body ?? content!.body!} />
          {content!.citations.length > 0 && (
            <div className="citations">
              <span className="citations-label">{tr(dict, "Sources")}</span>
              {content!.citations.map((id) => (
                <span key={id} className="source-chip">{id}</span>
              ))}
            </div>
          )}
          <div className="trust-strip">
            {content!.author && (
              <>Reviewed by {content!.author}{content!.credentials ? `, ${content!.credentials}` : ""}.<br /></>
            )}
            {tr(dict, "General information, not advice. Your specific situation is decided on a call.")}
            <br />
            {tr(dict, "Last reviewed")}: {content!.lastReviewed ?? "pending"}
          </div>
          {/* JSON-LD stays English: the authoritative, citable version for search and LLMs. */}
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

      {hasGenerated && qa.length > 0 && (
        <section className="qa-section">
          <h2>{tr(dict, "Questions & answers")}</h2>
          {qa.map((item, i) => (
            <div key={i} className="qa-item">
              <p className="qa-q">{item.question}</p>
              <Markdown text={item.answer} />
            </div>
          ))}
        </section>
      )}
      {hasGenerated && <AskDesk corridor={corridor} unitSlug={unitSlug} />}

      <BookCall />
    </article>
  );
}
