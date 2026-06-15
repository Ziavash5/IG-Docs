import Link from "next/link";
import { journey, pathFor } from "@/lib/content";
import { getActiveCorridor } from "@/lib/corridor";
import { getLang, getDict } from "@/lib/i18n";
import { tr } from "@/lib/i18n-shared";
import { BookCall } from "./components";

export const dynamic = "force-dynamic";

export default async function Home() {
  const corridor = await getActiveCorridor();
  const lang = await getLang();
  const dict = await getDict(lang);
  return (
    <>
      <p className="eyebrow">InterGest Canada</p>
      <h1 className="accent-head" style={{ fontSize: 46 }}>
        {tr(dict, "The Art of Being Local in Canada")}
      </h1>
      <p className="lead">
        {tr(dict, "Most guidance on entering Canada is written for no company in particular. The answer that actually matters depends on where your company is based. This is the version written for yours.")}
      </p>

      <h2>{tr(dict, "What this is")}</h2>
      <p>{tr(dict, "A working reference for foreign companies setting up and running operations in Canada. Each answer is tied to an official government source and written for a specific home country. We start with companies from Germany, and add more countries as we go.")}</p>
      <p>{tr(dict, "Setting up in Canada is not one answer. How your profits are taxed, which immigration route fits, what your parent company owes back home, all of it shifts depending on where you are coming from. That difference is the whole point of this hub, and it is the part generic guidance leaves out.")}</p>

      <h2>{tr(dict, "Who it is for")}</h2>
      <p>{tr(dict, "Founders, finance leads, and the people running the entity once it is live. If you have been handed boilerplate “how to incorporate in Canada” advice and felt it ignored your company back home, this was built for you.")}</p>

      <h2>{tr(dict, "How to use it")}</h2>
      <ol className="how-list">
        <li><strong>{tr(dict, "Set your home country")}</strong> {tr(dict, "at the top of the navigation. Every answer adjusts to it.")}</li>
        <li><strong>{tr(dict, "Follow the three stages")}</strong> {tr(dict, "if you are starting out, or go straight to the question you have.")}</li>
        <li><strong>{tr(dict, "Read each answer the same way:")}</strong> {tr(dict, "the rule, what it depends on, and how your home country changes it.")}</li>
        <li><strong>{tr(dict, "When it turns on your specifics,")}</strong> {tr(dict, "that is a conversation, not a form. We will tell you when, and you can book a call.")}</li>
      </ol>

      <h2>{tr(dict, "The three stages")}</h2>
      {journey.map((stage) => (
        <section key={stage.slug} className="stage-block">
          <p className="eyebrow" style={{ border: "none", paddingBottom: 0 }}>
            {tr(dict, stage.label)}
          </p>
          <p className="lead" style={{ fontSize: 18 }}>
            {tr(dict, stage.tagline)}
          </p>
          <div className="card-grid">
            {stage.pillars.map((p) => (
              <Link key={p.slug} href={pathFor(corridor, stage.slug, p.slug)} className="card">
                <span className="card-n">{tr(dict, "Pillar")} {p.n}</span>
                <h3>{tr(dict, p.title)}</h3>
                <p className="card-service">{tr(dict, p.service)}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <BookCall />
    </>
  );
}
