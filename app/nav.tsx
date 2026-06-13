"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { journey, corridors, pathFor } from "@/lib/content";

/**
 * Left navigation: home-country selector, then journey stages → pillars → units.
 * Data-driven from lib/content.ts. On mobile the tree collapses behind a toggle.
 */
export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <nav className="nav" aria-label="Documentation">
      <div className="nav-top">
        <Link href="/" className="nav-brand" onClick={close}>
          <span className="nav-brand-mark">InterGest</span>
          <span className="nav-brand-sub">Canada</span>
        </Link>
        <button
          className="nav-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Browse"}
        </button>
      </div>

      <div className="corridor-field">
        <label htmlFor="corridor">Where your company is based</label>
        <div className="corridor-select-wrap">
          <select id="corridor" defaultValue="dach" className="corridor-select">
            {corridors.map((c) => (
              <option key={c.slug} value={c.slug} disabled={!c.active}>
                {c.label}
                {c.active ? "" : " (coming soon)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`nav-scroll${open ? " is-open" : ""}`}>
        {journey.map((stage) => (
          <section key={stage.slug} className="nav-stage">
            <Link
              href={pathFor(stage.slug, stage.pillars[0].slug)}
              className="nav-stage-label"
              onClick={close}
            >
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
                    onClick={close}
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
                            onClick={close}
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
