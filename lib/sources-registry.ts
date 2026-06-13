import type { Source } from "./pipeline/types";

/**
 * Seed of the official source registry (docs/sources.md) with canonical URLs for
 * ingestion. Official primary sources only. DACH-corridor first; expand as corridors
 * are added. `corridor: "base"` sources are candidates for every corridor.
 */
const CRA = "https://www.canada.ca/en/revenue-agency/services/tax";

export const SOURCE_REGISTRY: Source[] = [
  // Canada — base layer
  { id: "corp-canada", body: "Corporations Canada (ISED)", corridor: "base",
    url: "https://ised-isde.canada.ca/site/corporations-canada/en/business-corporations",
    crawl: { prefix: "https://ised-isde.canada.ca/site/corporations-canada/en", max: 30 } },
  { id: "justice-cbca", body: "Justice Laws — Canada Business Corporations Act", corridor: "base",
    url: "https://laws-lois.justice.gc.ca/eng/acts/C-44/",
    urls: ["https://laws-lois.justice.gc.ca/eng/acts/C-44/FullText.html"] },
  { id: "justice-ita", body: "Justice Laws — Income Tax Act", corridor: "base",
    url: "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/",
    urls: ["https://laws-lois.justice.gc.ca/eng/acts/I-3.3/FullText.html"] },
  { id: "cra-corp-tax", body: "Canada Revenue Agency — Corporation income tax", corridor: "base",
    url: `${CRA}/businesses/topics/corporations.html`,
    crawl: { prefix: `${CRA}/businesses/topics/corporations`, max: 30 } },
  { id: "cra-gsthst", body: "Canada Revenue Agency — GST/HST for businesses", corridor: "base",
    url: `${CRA}/businesses/topics/gst-hst-businesses.html`,
    crawl: { prefix: `${CRA}/businesses/topics/gst-hst-businesses`, max: 30 } },
  { id: "cra-payroll", body: "Canada Revenue Agency — Payroll", corridor: "base",
    url: `${CRA}/businesses/topics/payroll.html`,
    crawl: { prefix: `${CRA}/businesses/topics/payroll`, max: 30 } },
  { id: "cra-nonres", body: "Canada Revenue Agency — Non-residents and income tax", corridor: "base",
    url: `${CRA}/international-non-residents.html`,
    crawl: { prefix: `${CRA}/international-non-residents`, max: 30 } },
  { id: "ircc", body: "Immigration, Refugees and Citizenship Canada — Work permits", corridor: "base",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit.html",
    crawl: { prefix: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada", max: 25 } },

  // DACH overlay — source-country (the moat)
  { id: "fin-ca-de-treaty", body: "Department of Finance Canada — Tax treaties", corridor: "dach",
    url: "https://www.canada.ca/en/department-finance/programs/tax-policy/tax-treaties.html",
    crawl: { prefix: "https://www.canada.ca/en/department-finance/programs/tax-policy/tax-treaties", max: 15 } },
  { id: "servicecanada-ssa-de", body: "Service Canada — Canada–Germany social security agreement", corridor: "dach",
    url: "https://www.canada.ca/en/employment-social-development/programs/international-benefits/countries/germany.html",
    crawl: { prefix: "https://www.canada.ca/en/employment-social-development/programs/international-benefits", max: 12 } },
  { id: "de-bzst", body: "Bundeszentralamt für Steuern (DE) — Foreign tax", corridor: "dach",
    url: "https://www.bzst.de/EN/Businesses/businesses_node.html",
    crawl: { prefix: "https://www.bzst.de/EN", max: 15 } },
  { id: "de-handelsregister", body: "Handelsregister (DE) — Company register", corridor: "dach",
    url: "https://www.handelsregister.de/rp_web/welcome.xhtml" },
];

/** Candidate sources for a corridor: base layer + that corridor's overlay. */
export function candidatesFor(corridor: string): Source[] {
  return SOURCE_REGISTRY.filter((s) => s.corridor === "base" || s.corridor === corridor);
}
