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
  "Pillar",
  "by",
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
  // Home page
  "The Art of Being Local in Canada",
  "Most guidance on entering Canada is written for no company in particular. The answer that actually matters depends on where your company is based. This is the version written for yours.",
  "What this is",
  "A working reference for foreign companies setting up and running operations in Canada. Each answer is tied to an official government source and written for a specific home country. We start with companies from Germany, and add more countries as we go.",
  "Setting up in Canada is not one answer. How your profits are taxed, which immigration route fits, what your parent company owes back home, all of it shifts depending on where you are coming from. That difference is the whole point of this hub, and it is the part generic guidance leaves out.",
  "Who it is for",
  "Founders, finance leads, and the people running the entity once it is live. If you have been handed boilerplate “how to incorporate in Canada” advice and felt it ignored your company back home, this was built for you.",
  "How to use it",
  "Set your home country",
  "at the top of the navigation. Every answer adjusts to it.",
  "Follow the three stages",
  "if you are starting out, or go straight to the question you have.",
  "Read each answer the same way:",
  "the rule, what it depends on, and how your home country changes it.",
  "When it turns on your specifics,",
  "that is a conversation, not a form. We will tell you when, and you can book a call.",
  "The three stages",
  // CTA block
  "Have a specific situation?",
  "The guides cover the rules. Your structure, tax position, and timing come together on a short call with someone who has done it before.",
  "Book a 20-minute Canada-entry call",
  "Talk to an expansion advisor",
  // Chat widget
  "Ask about Canada",
  "Ask InterGest Canada",
  "Answers from official sources. For your specifics, we'll point you to a call.",
  "New",
  "New conversation",
  "Try:",
  "Do I need a Canadian subsidiary or can I run a branch?",
  "When does my German company owe GST/HST in Canada?",
  "How do I move an employee to our Canadian office?",
  "Get the answer for your company →",
  "Get the specifics for your company",
  "Leave your details and the InterGest Canada team will follow up with the answer for your situation. No obligation.",
  "Name",
  "Work email",
  "Company",
  "Cancel",
  "Thanks. We'll be in touch shortly.",
  "Ask a question…",
  "Something went wrong. Please try again.",
  "Sending…",
];
