import type { Metadata } from "next";
import "./globals.css";
import Nav from "./nav";
import ChatWidget from "./chat-widget";
import { getCurriculum } from "@/lib/curriculum";
import { getActiveCorridor, allCorridors } from "@/lib/corridor";
import { getLang, getDict, allLanguages } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "InterGest Canada — The Art of Being Local in Canada",
  description:
    "Corridor-specific guidance for foreign companies setting up and operating in Canada. From company setup to daily operations and leadership.",
};

/**
 * Swiss-style docs shell: persistent left navigation (corridors → pillars → units) and
 * a readable content column, in the spirit of Foundry / GitHub docs. The nav is a
 * placeholder tree until units are wired from the corpus.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const corridor = await getActiveCorridor();
  const lang = await getLang();
  const [journey, corridors, languages, dict] = await Promise.all([
    getCurriculum(corridor),
    allCorridors(),
    allLanguages(),
    getDict(lang),
  ]);
  return (
    <html lang={lang}>
      <body>
        <div className="shell">
          <Nav journey={journey} corridors={corridors} active={corridor} languages={languages} lang={lang} dict={dict} />
          <main className="content">
            <div className="col">{children}</div>
          </main>
        </div>
        <ChatWidget />
      </body>
    </html>
  );
}
