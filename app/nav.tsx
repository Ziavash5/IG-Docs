"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { journey, corridors, pathFor } from "@/lib/content";

/**
 * Left navigation: corridor switcher → journey stages → pillars → units. Data-driven
 * from lib/content.ts. Active unit is highlighted; planned units are muted with a dot.
 */
export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Documentation">
      <Link href="/" className="nav-brand">
        <span className="nav-brand-mark">InterGest</span>
        <span className="nav-brand-sub">Canada</span>
      </Link>

      <div className="corridor-switch" role="tablist" aria-label="Corridor">
        {corridors.map((c) => (
          <span
            key={c.slug}
            className={`corridor-pill${c.active ? " is-active" : " is-soon"}`}
            title={c.active ? `${c.label} corridor` : "Coming soon"}
          >
            {c.label}
          </span>
        ))}
      </div>

      <div className="nav-scroll">
        {journey.map((stage) => (
          <section key={stage.slug} className="nav-stage">
            <Link href={pathFor(stage.slug, stage.pillars[0].slug)} className="nav-stage-label">
              {stage.label}
            </Link>
            {stage.pillars.map((pillar) => {
              const pillarPath = pathFor(stage.slug, pillar.slug);
              const inPillar = pathname.startsWith(pillarPath);
              return (
                <div key={pillar.slug} className="nav-pillar">
                  <Link
                    href={pillarPath}
                    className={`nav-pillar-title${inPillar ? " is-open" : ""}`}
                  >
                    <span className="nav-pillar-n">{pillar.n}</span>
                    {pillar.title}
                  </Link>
                  <ul className="nav-units">
                    {pillar.units.map((u) => {
                      const href = pathFor(stage.slug, pillar.slug, u.slug);
                      const active = pathname === href;
                      const planned = u.state === "planned";
                      return (
                        <li key={u.slug}>
                          <Link
                            href={href}
                            className={`nav-unit${active ? " is-active" : ""}${
                              planned ? " is-planned" : ""
                            }`}
                            aria-current={active ? "page" : undefined}
                          >
                            <span className={`nav-dot state-${u.state}`} aria-hidden />
                            {u.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </nav>
  );
}
