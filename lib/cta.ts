import { getSetting } from "./db";

export const DEFAULT_CTA_LABEL = "Book a Canadian expansion consultation with InterGest";
export const DEFAULT_CTA_URL = "mailto:hello@intergest.ca?subject=Canada-entry%20call";

/** The booking CTA (operator-configurable in admin), used on guides, in llms.txt, and chat. */
export async function getCta(): Promise<{ label: string; url: string }> {
  try {
    const [label, url] = await Promise.all([getSetting("cta_label"), getSetting("cta_url")]);
    return { label: label || DEFAULT_CTA_LABEL, url: url || DEFAULT_CTA_URL };
  } catch {
    return { label: DEFAULT_CTA_LABEL, url: DEFAULT_CTA_URL };
  }
}
