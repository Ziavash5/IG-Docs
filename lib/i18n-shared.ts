/**
 * Client-safe i18n helpers (no DB / no Anthropic imports, so this is safe to import
 * into client components). The server module `lib/i18n.ts` does the actual translating
 * and caching. English is always the source of truth: `tr` returns the original English
 * string whenever a translation is missing, so the UI never breaks.
 */

export const DEFAULT_LANG = "en";

/** Stable, fast string hash (djb2) -> hex. Used as the translation cache key. */
export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export type StringMap = Record<string, string>;

/** Translate one short UI string via the prepared map; fall back to English. */
export function tr(map: StringMap | undefined, text: string): string {
  if (!map) return text;
  return map[hashText(text)] ?? text;
}

/**
 * Every fixed UI string that should be translated. Dynamic strings (pillar titles, topic
 * titles, taglines) are added to the batch at sync time from the curriculum, so they do
 * not need listing here.
 */
export const UI_STRINGS: string[] = [
  // Nav
  "Where your company is based",
  "Language",
  "Browse",
  "Close",
  "coming soon",
  // Unit reading experience
  "Sources",
  "Questions & answers",
  "Last reviewed",
  "Published",
  "In review",
  "General information, not advice. Your specific situation is decided on a call.",
  "Machine-translated for convenience. The English version is authoritative.",
  "Ask a question about this topic",
  "We answer the best ones and publish them here. Leave your email if you want a reply.",
  "Your question",
  "Email (optional)",
  "Send",
  "Thanks. We review every question.",
  // Home
  "The corridor-specific guide to setting up and operating in Canada.",
  "How to use this guide",
  "Who this is for",
  // CTA fallback
  "Book a 20-minute Canada-entry call",
  "Talk to an expansion advisor",
  // Chat
  "Ask about expanding to Canada",
  "Grounded in official sources. Ask anything.",
  "New conversation",
  "Send a message",
];
