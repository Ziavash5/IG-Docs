import "server-only";
import { cookies } from "next/headers";
import { anthropic, MODEL, textOf, jsonCall } from "./anthropic";
import {
  listLanguages,
  getStringMap,
  getTranslation,
  setTranslation,
  publishedUnitBodies,
  publishedQaAnswers,
} from "./db";
import { listTopics } from "./db";
import { allCorridors } from "./corridor";
import { journey } from "./content";
import { DEFAULT_LANG, UI_STRINGS, hashText, type StringMap } from "./i18n-shared";

export { DEFAULT_LANG } from "./i18n-shared";

export interface Language { slug: string; label: string; nativeName: string | null }

const ENGLISH: Language = { slug: "en", label: "English", nativeName: "English" };

/** English plus any languages added in the console. */
export async function allLanguages(): Promise<Language[]> {
  try {
    return [ENGLISH, ...(await listLanguages())];
  } catch {
    return [ENGLISH];
  }
}

/** The reader's chosen language (cookie), defaulting to English. */
export async function getLang(): Promise<string> {
  try {
    return (await cookies()).get("lang")?.value || DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

async function labelFor(lang: string): Promise<string> {
  if (lang === "en") return "English";
  const l = (await listLanguages()).find((x) => x.slug === lang);
  return l?.label ?? lang;
}

/** Prepared short-string map for rendering (empty for English). */
export async function getDict(lang: string): Promise<StringMap> {
  if (lang === DEFAULT_LANG) return {};
  try {
    return await getStringMap(lang);
  } catch {
    return {};
  }
}

const noEmDash = (s: string) => s.replace(/\s*—\s*/g, ", ");

/**
 * Translate a batch of short strings. Forced-tool-use JSON keeps it structured. The model
 * must NOT translate the brand, source ids, numbers, statute names, or URLs.
 */
async function translateBatch(texts: string[], langLabel: string): Promise<string[]> {
  if (texts.length === 0) return [];
  const parsed = await jsonCall<{ items: { i: number; t: string }[] }>({
    maxTokens: 8000,
    schema: {
      type: "object", additionalProperties: false, required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["i", "t"],
            properties: { i: { type: "integer" }, t: { type: "string" } },
          },
        },
      },
    },
    system:
      `You are a professional translator localising a Canadian market-entry knowledge hub into ${langLabel}. ` +
      "Translate each string accurately and naturally for a business audience. Keep meaning precise; this is " +
      "tax, legal, and corporate content, so do not paraphrase loosely. DO NOT translate or alter: the brand " +
      "'InterGest Canada', proper nouns of laws/agencies, source ids, numbers, currency, dates, or URLs. " +
      "Preserve any punctuation placeholders. Never use em-dashes. Return every item by its index.",
    user: `Translate these ${texts.length} strings into ${langLabel}:\n` +
      texts.map((t, i) => `[${i}] ${t}`).join("\n"),
  });
  const out = [...texts];
  for (const it of parsed.items ?? []) {
    if (typeof it.i === "number" && it.i >= 0 && it.i < out.length && typeof it.t === "string") {
      out[it.i] = noEmDash(it.t);
    }
  }
  return out;
}

/** Every short string that should be translated: fixed UI + stage/pillar copy + topics. */
async function collectStrings(): Promise<string[]> {
  const set = new Set<string>(UI_STRINGS);
  for (const s of journey) {
    set.add(s.label);
    set.add(s.tagline);
    for (const p of s.pillars) {
      set.add(p.title);
      if (p.blurb) set.add(p.blurb);
      if (p.service) set.add(p.service);
    }
  }
  try {
    for (const c of await allCorridors()) {
      for (const t of await listTopics(c.slug)) {
        if (t.title) set.add(t.title);
        if (t.question) set.add(t.question);
      }
    }
  } catch {
    /* topics optional */
  }
  return [...set].filter((s) => s.trim());
}

/**
 * Translate and cache every short UI/label string for a language (one pass). Used by the
 * "Translate now" button; safe to re-run (skips already-cached strings).
 */
export async function syncStrings(lang: string): Promise<number> {
  if (lang === DEFAULT_LANG) return 0;
  const label = await labelFor(lang);
  const have = await getStringMap(lang);
  const todo = (await collectStrings()).filter((s) => !have[hashText(s)]);
  let done = 0;
  const CHUNK = 40;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const slice = todo.slice(i, i + CHUNK);
    const translated = await translateBatch(slice, label);
    for (let j = 0; j < slice.length; j++) {
      await setTranslation(lang, "s", hashText(slice[j]), translated[j]);
      done++;
    }
  }
  return done;
}

export interface TranslateStep { done: boolean; remaining: number; message: string }

/**
 * One unit of bulk-translation work, looped by the client (like ingest). Priority: finish
 * the UI/label strings, then translate each published guide body, then each published Q&A
 * answer. Returns done=true when everything for the language is cached.
 */
export async function translateStep(lang: string): Promise<TranslateStep> {
  if (lang === DEFAULT_LANG) return { done: true, remaining: 0, message: "English needs no translation." };
  const label = await labelFor(lang);

  // 1) UI / nav / label strings, a chunk at a time.
  const have = await getStringMap(lang);
  const todoStrings = (await collectStrings()).filter((s) => !have[hashText(s)]);
  if (todoStrings.length) {
    const slice = todoStrings.slice(0, 40);
    const translated = await translateBatch(slice, label);
    for (let j = 0; j < slice.length; j++) await setTranslation(lang, "s", hashText(slice[j]), translated[j]);
    const remaining = todoStrings.length - slice.length;
    return { done: false, remaining, message: `Labels: translated ${slice.length}, ${remaining} left.` };
  }

  // 2) Published guide bodies, one per step.
  const bodies = await publishedUnitBodies();
  const uncachedBodies: { corridor: string; slug: string; body: string }[] = [];
  for (const u of bodies) {
    if (!(await getTranslation(lang, "d", hashText(u.body)))) uncachedBodies.push(u);
  }
  if (uncachedBodies.length) {
    const u = uncachedBodies[0];
    await translateDoc(lang, u.body);
    return { done: false, remaining: uncachedBodies.length - 1, message: `Translated guide ${u.corridor}/${u.slug}. ${uncachedBodies.length - 1} guides left.` };
  }

  // 3) Published Q&A answers, one per step.
  const answers = await publishedQaAnswers();
  for (const a of answers) {
    if (!(await getTranslation(lang, "d", hashText(a)))) {
      await translateDoc(lang, a);
      return { done: false, remaining: 0, message: "Translated a Q&A answer." };
    }
  }

  return { done: true, remaining: 0, message: `All content is translated into ${label}.` };
}

/**
 * Translate a long markdown document (a unit body or answer), cached by content hash so it
 * re-translates only when the English changes. Preserves markdown, numbers, statute refs,
 * source-id chips, and URLs.
 */
export async function translateDoc(lang: string, markdown: string): Promise<string> {
  if (lang === DEFAULT_LANG || !markdown.trim()) return markdown;
  const key = hashText(markdown);
  try {
    const cached = await getTranslation(lang, "d", key);
    if (cached) return cached;
  } catch {
    return markdown;
  }
  const label = await labelFor(lang);
  try {
    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system:
        `You translate Canadian market-entry guidance into ${label} for a business audience. ` +
        "Translate the prose accurately and naturally. This is tax, legal, and corporate content: be " +
        "precise, do not paraphrase loosely or drop detail. PRESERVE EXACTLY, untranslated and unchanged: " +
        "all numbers, currency amounts, percentages, dates, section and article references, names of laws " +
        "and government agencies, the brand 'InterGest Canada', source-id tokens, and URLs. PRESERVE the " +
        "markdown structure exactly: '##'/'###' headings, '> ' callouts, '- ' lists, and **bold** markers. " +
        "Never use em-dashes. Return only the translated markdown, no preamble.",
      messages: [{ role: "user", content: markdown }],
    });
    const out = noEmDash(textOf(msg).trim());
    await setTranslation(lang, "d", key, out).catch(() => {});
    return out || markdown;
  } catch {
    return markdown; // fall back to English on any failure
  }
}
