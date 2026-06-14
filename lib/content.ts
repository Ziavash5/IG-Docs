import type { RiskTier } from "./question-unit";

/**
 * The content information architecture — the single source of truth for the site's
 * structure and the inbound funnel. Nav, routing, and landing pages all derive from
 * this. Journey stage → pillar (mapped to an InterGest service) → question-unit.
 *
 * Ordered 0→100: broad/educational at the top (Enter), high-intent/high-value at the
 * bottom (Thrive). Units that aren't written yet are `state: "planned"` — they appear in
 * the nav as the content roadmap the generation pipeline will fill.
 */

export type UnitState = "published" | "in_review" | "planned";

export interface UnitSection {
  heading: string;
  body: string;
}

export interface UnitContent {
  /** The retrieved-and-cited passage: answers the question in 1–3 sentences. */
  directAnswer: string;
  sections: UnitSection[];
  /** The source-country delta — the moat. Omitted for base-layer units. */
  corridorDelta?: string;
  checklist?: string[];
}

export interface UnitEntry {
  slug: string;
  /** Short nav label. */
  title: string;
  /** The exact long-tail question the unit answers. */
  question: string;
  riskTier: RiskTier;
  state: UnitState;
  /** source_ids from docs/sources.md. */
  citations?: string[];
  content?: UnitContent;
}

export interface Pillar {
  n: number;
  slug: string;
  title: string;
  /** The InterGest service this pillar maps to. */
  service: string;
  blurb: string;
  units: UnitEntry[];
}

export interface Stage {
  slug: string;
  label: string;
  tagline: string;
  pillars: Pillar[];
}

export interface CorridorOption {
  slug: string;
  label: string;
  active: boolean;
}

export const corridors: CorridorOption[] = [
  { slug: "germany", label: "Germany", active: true },
  { slug: "austria", label: "Austria", active: false },
  { slug: "switzerland", label: "Switzerland", active: false },
  { slug: "uk", label: "UK", active: false },
  { slug: "usa", label: "USA", active: false },
  { slug: "australia", label: "Australia", active: false },
  { slug: "japan", label: "Japan", active: false },
  { slug: "india", label: "India", active: false },
];

const planned = (
  slug: string,
  title: string,
  question: string,
  riskTier: RiskTier,
): UnitEntry => ({ slug, title, question, riskTier, state: "planned" });

export const journey: Stage[] = [
  {
    slug: "enter",
    label: "Enter",
    tagline: "Decide, structure, and stand up your Canadian presence.",
    pillars: [
      {
        n: 1,
        slug: "decide-structure",
        title: "Decide & Structure",
        service: "Business Consulting & Strategy",
        blurb:
          "Choose how and where to enter Canada before you commit capital.",
        units: [
          {
            slug: "germany-branch-vs-subsidiary-canada",
            title: "Branch vs subsidiary",
            question: "Should a German company open a Canadian branch or a subsidiary?",
            riskTier: "interpretive",
            state: "in_review",
            citations: [
              "justice-cbca",
              "justice-ita",
              "cra-corp-tax",
              "cra-nonres",
              "fin-ca-de-treaty",
              "de-bzst",
            ],
            content: {
              directAnswer:
                "For most German companies establishing a lasting presence in Canada, a Canadian subsidiary (a corporation incorporated in Canada) is the common structure: it ring-fences liability and is taxed as a Canadian resident. A branch keeps the operation inside the German parent's legal entity. The right choice turns on liability, how profits are taxed on both the Canadian and German sides, and treaty treatment.",
              sections: [
                {
                  heading: "The rule (Canada side)",
                  body: "A subsidiary is incorporated under the Canada Business Corporations Act. A branch is the German parent carrying on business in Canada directly; its Canadian-source business income is taxed, and branch tax applies under the Income Tax Act. Branch tax may be reduced or eliminated under the Canada–Germany Tax Treaty.",
                },
                {
                  heading: "What determines how it applies",
                  body: "Expected liability exposure of the Canadian activity; whether the activity creates a permanent establishment; repatriation plans (dividends from a subsidiary vs. branch profit remittance); and whether early Canadian losses are wanted on the German books.",
                },
              ],
              corridorDelta:
                "Here is what changes on the German side. A branch's Canadian result flows straight into the German parent's accounts. A subsidiary is a separate taxpayer, so its profits face German tax only on distribution or under CFC rules, and German CFC treatment (Außensteuergesetz) is usually the deciding factor. The Canada–Germany treaty also sets branch tax and dividend withholding on its own terms. This is the part a Canada-only adviser cannot write for you.",
              checklist: [
                "Decide structure (this unit) → if subsidiary, see Incorporate & Register.",
                "Confirm whether the activity creates a Canadian permanent establishment.",
                "Map the German-side tax consequence of the chosen structure.",
                "Register for the relevant CRA program accounts.",
              ],
            },
          },
          planned(
            "which-canadian-province-german-company",
            "Choosing a province",
            "Which Canadian province should a German company set up in?",
            "interpretive",
          ),
          planned(
            "canada-vs-usa-north-american-base-dach",
            "Canada vs USA base",
            "Should a German company base its North American operations in Canada or the USA?",
            "interpretive",
          ),
        ],
      },
      {
        n: 2,
        slug: "incorporate-register",
        title: "Incorporate & Register",
        service: "Business Setup & Incorporation",
        blurb: "Stand up a compliant Canadian legal entity.",
        units: [
          planned(
            "how-german-gmbh-opens-canadian-subsidiary",
            "GmbH → Canadian subsidiary",
            "How does a German GmbH open a Canadian subsidiary?",
            "factual",
          ),
          planned(
            "federal-vs-provincial-incorporation-canada",
            "Federal vs provincial",
            "Should a foreign company incorporate federally or provincially in Canada?",
            "factual",
          ),
          planned(
            "director-residency-requirements-canada",
            "Director residency",
            "What are the director residency requirements for a Canadian corporation?",
            "factual",
          ),
        ],
      },
      {
        n: 3,
        slug: "stay-compliant",
        title: "Stay Compliant",
        service: "Legal & Regulatory Compliance",
        blurb: "Meet Canada's federal and provincial filing obligations.",
        units: [
          planned(
            "extra-provincial-registration-foreign-company",
            "Extra-provincial registration",
            "Does a foreign-owned company need extra-provincial registration in Canada?",
            "factual",
          ),
          planned(
            "beneficial-ownership-register-canada",
            "Beneficial ownership register",
            "What are the beneficial ownership (ISC) register requirements in Canada?",
            "factual",
          ),
        ],
      },
      {
        n: 4,
        slug: "move-your-people",
        title: "Move Your People",
        service: "Immigration & Residency Services",
        blurb: "Bring key personnel to Canada compliantly.",
        units: [
          planned(
            "intra-company-transfer-permit-german-staff",
            "Intra-company transfer",
            "How does a German company transfer staff to Canada on an intra-company work permit?",
            "interpretive",
          ),
          planned(
            "ceta-mobility-eu-nationals-canada",
            "CETA mobility",
            "How does CETA help EU nationals work in Canada?",
            "interpretive",
          ),
        ],
      },
    ],
  },
  {
    slug: "operate",
    label: "Operate",
    tagline: "Run the Canadian entity day to day.",
    pillars: [
      {
        n: 5,
        slug: "tax-and-finance",
        title: "Tax & Finance",
        service: "Financial & Tax Services",
        blurb: "Stay onside with Canada's multi-layered tax system.",
        units: [
          planned(
            "canada-germany-treaty-withholding-tax",
            "Treaty withholding tax",
            "What withholding tax applies under the Canada–Germany treaty on dividends, interest, and royalties?",
            "interpretive",
          ),
          planned(
            "permanent-establishment-risk-german-company",
            "Permanent establishment risk",
            "When does a German company create a permanent establishment in Canada?",
            "interpretive",
          ),
          planned(
            "gst-hst-registration-foreign-owned",
            "GST/HST registration",
            "Does a foreign-owned Canadian company need to register for GST/HST?",
            "factual",
          ),
          planned(
            "transfer-pricing-german-parent-canadian-sub",
            "Transfer pricing",
            "How does transfer pricing work between a German parent and its Canadian subsidiary?",
            "interpretive",
          ),
        ],
      },
      {
        n: 6,
        slug: "hr-and-payroll",
        title: "HR & Payroll",
        service: "HR & Payroll Management",
        blurb: "Pay and employ people correctly across provinces.",
        units: [
          planned(
            "canadian-payroll-setup-german-subsidiary",
            "Payroll setup",
            "How does a German subsidiary set up Canadian payroll?",
            "factual",
          ),
          planned(
            "canada-germany-social-security-totalization",
            "Social-security totalization",
            "How does the Canada–Germany social security agreement affect posted employees?",
            "interpretive",
          ),
        ],
      },
    ],
  },
  {
    slug: "thrive",
    label: "Thrive",
    tagline: "Scale and lead the Canadian operation.",
    pillars: [
      {
        n: 7,
        slug: "scale-and-lead",
        title: "Scale & Lead",
        service: "Fractional Leadership · Capital Markets & Listing",
        blurb: "Senior leadership and capital for the next stage of growth.",
        units: [
          planned(
            "fractional-cfo-dach-subsidiary-canada",
            "Fractional CFO",
            "When does a German-owned Canadian subsidiary need a fractional CFO?",
            "interpretive",
          ),
          planned(
            "raising-capital-listing-foreign-owned-canada",
            "Raising capital & listing",
            "How can a foreign-owned company raise capital or list in Canada?",
            "interpretive",
          ),
        ],
      },
    ],
  },
];

// ---- Resolvers ---------------------------------------------------------------

export const pathFor = (stage: string, pillar: string, unit?: string): string =>
  unit ? `/${stage}/${pillar}/${unit}` : `/${stage}/${pillar}`;

export function findStage(stageSlug: string): Stage | undefined {
  return journey.find((s) => s.slug === stageSlug);
}

export function findPillar(stageSlug: string, pillarSlug: string) {
  const stage = findStage(stageSlug);
  const pillar = stage?.pillars.find((p) => p.slug === pillarSlug);
  return pillar ? { stage: stage!, pillar } : undefined;
}

export function findUnit(stageSlug: string, pillarSlug: string, unitSlug: string) {
  const found = findPillar(stageSlug, pillarSlug);
  const unit = found?.pillar.units.find((u) => u.slug === unitSlug);
  return unit ? { ...found!, unit } : undefined;
}

/** Look up a pillar's number/metadata by its slug (pillars are fixed config). */
export function pillarBySlug(slug: string): { n: number; title: string; service: string; stageSlug: string } | undefined {
  for (const s of journey) {
    const p = s.pillars.find((x) => x.slug === slug);
    if (p) return { n: p.n, title: p.title, service: p.service, stageSlug: s.slug };
  }
  return undefined;
}

export interface TopicRow {
  id: string;
  stage: string;
  pillarSlug: string;
  slug: string;
  title: string;
  question: string;
  riskTier: RiskTier;
  position: number;
}

/** Flatten the default journey into topic rows, for seeding the editable curriculum. */
export function defaultTopicRows(): TopicRow[] {
  const rows: TopicRow[] = [];
  for (const s of journey) {
    for (const p of s.pillars) {
      p.units.forEach((u, i) => {
        rows.push({
          id: u.slug,
          stage: s.slug,
          pillarSlug: p.slug,
          slug: u.slug,
          title: u.title,
          question: u.question,
          riskTier: u.riskTier,
          position: i,
        });
      });
    }
  }
  return rows;
}

/** Pillar shells (no units) keyed for rebuilding the tree from DB topics. */
export function pillarShells(): Stage[] {
  return journey.map((s) => ({ ...s, pillars: s.pillars.map((p) => ({ ...p, units: [] })) }));
}

/** Every (stage, pillar, unit) triple — used for static generation. */
export function allUnitParams() {
  return journey.flatMap((s) =>
    s.pillars.flatMap((p) =>
      p.units.map((u) => ({ stage: s.slug, pillar: p.slug, unit: u.slug })),
    ),
  );
}
