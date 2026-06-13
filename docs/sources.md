# Official Source Registry

**Policy: official primary sources only.** Government bodies, official registries, and
primary legislation. **No blogs, no law-firm marketing, no secondary commentary.** This
is where real experts source from, and it is the bar search/AI systems apply before
citing YMYL content. Every claim in every unit must trace back to an entry here.

Each source has a stable `source_id` used in unit frontmatter (`claims[].source_id`,
`citations[]`).

## Canada — base layer

| source_id | Body | Covers | Notes |
|-----------|------|--------|-------|
| `corp-canada` | Corporations Canada (ISED) | Federal incorporation, directors, registered office | Primary registry |
| `cra-corp-tax` | Canada Revenue Agency | Corporate income tax (T2), filing | |
| `cra-gsthst` | Canada Revenue Agency | GST/HST registration & thresholds | |
| `cra-payroll` | Canada Revenue Agency | Payroll, source deductions | |
| `cra-nonres` | Canada Revenue Agency | Non-resident withholding (Part XIII, Reg 105) | Corridor-relevant |
| `fin-ca-de-treaty` | Department of Finance Canada | Canada–Germany Tax Treaty (text) | Corridor-relevant |
| `justice-ita` | Justice Laws Website | Income Tax Act (primary legislation) | laws-lois.justice.gc.ca |
| `justice-cbca` | Justice Laws Website | Canada Business Corporations Act | |
| `ircc` | Immigration, Refugees and Citizenship Canada | Work permits, intra-company transferee | |
| `ircc-ceta` | IRCC | CETA-based mobility (EU nationals) | DACH/EU edge; not available to non-EU |
| `servicecanada-ssa-de` | Service Canada | Canada–Germany Social Security Agreement (totalization) | Corridor-relevant |
| `ontario-registry` | Ontario Business Registry | Provincial / extra-provincial registration | |
| `bc-registries` | BC Registries | Provincial registration | |
| `req-qc` | Registraire des entreprises Québec | Quebec registration | |

## DACH overlay — source-country (the moat)

| source_id | Body | Covers | Notes |
|-----------|------|--------|-------|
| `de-handelsregister` | Handelsregister / Unternehmensregister (DE) | Parent verification: form, directors, capital | Free since Aug 2022 |
| `de-bmf` | Bundesministerium der Finanzen (DE) | German federal tax policy | |
| `de-bzst` | Bundeszentralamt für Steuern (DE) | Foreign tax, withholding, CFC (Außensteuergesetz) | German-side consequence |
| `at-firmenbuch` | Firmenbuch (AT) | Austrian company register | |
| `at-bmf` | BMF Österreich | Austrian federal tax | |
| `ch-zefix` | Zefix (CH) | Swiss company register | Free API w/ account |
| `ch-estv` | Eidg. Steuerverwaltung (CH) | Swiss federal tax | |
| `eu-ceta` | Official CETA text | EU–Canada mobility & trade basis | The edge Germany gets that non-EU corridors do not |

## Adding a source

1. Confirm it is a government / official body or primary legislation. If it's a blog or
   a firm's marketing, **reject it.**
2. Add a row with a stable `source_id`.
3. Capture the canonical URL. For legislation, link the section, not the homepage.
4. The freshness loop (Phase 4) monitors these URLs for changes.
