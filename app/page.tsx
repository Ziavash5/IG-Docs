import Link from "next/link";
import { journey, pathFor } from "@/lib/content";
import { getActiveCorridor } from "@/lib/corridor";
import { BookCall } from "./components";

export default async function Home() {
  const corridor = await getActiveCorridor();
  return (
    <>
      <p className="eyebrow">InterGest Canada</p>
      <h1 className="accent-head" style={{ fontSize: 46 }}>
        The <strong>Art</strong> of Being <strong>Local</strong> in Canada
      </h1>
      <p className="lead">
        Most guidance on entering Canada is written for no company in particular. The
        answer that actually matters depends on where your company is based. This is the
        version written for yours.
      </p>

      <h2>What this is</h2>
      <p>
        A working reference for foreign companies setting up and running operations in
        Canada. Each answer is tied to an official government source and written for a
        specific home country. We start with companies from Germany, and add more
        countries as we go.
      </p>
      <p>
        Setting up in Canada is not one answer. How your profits are taxed, which
        immigration route fits, what your parent company owes back home, all of it shifts
        depending on where you are coming from. That difference is the whole point of
        this hub, and it is the part generic guidance leaves out.
      </p>

      <h2>Who it is for</h2>
      <p>
        Founders, finance leads, and the people running the entity once it is live. If
        you have been handed boilerplate &ldquo;how to incorporate in Canada&rdquo; advice
        and felt it ignored your company back home, this was built for you.
      </p>

      <h2>How to use it</h2>
      <ol className="how-list">
        <li>
          <strong>Set your home country</strong> at the top of the navigation. Every
          answer adjusts to it.
        </li>
        <li>
          <strong>Follow the three stages</strong> if you are starting out, or go
          straight to the question you have.
        </li>
        <li>
          <strong>Read each answer the same way:</strong> the rule, what it depends on,
          and how your home country changes it.
        </li>
        <li>
          <strong>When it turns on your specifics,</strong> that is a conversation, not a
          form. We will tell you when, and you can book a call.
        </li>
      </ol>

      <h2>The three stages</h2>
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
              <Link key={p.slug} href={pathFor(corridor, stage.slug, p.slug)} className="card">
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
