import type { Metadata } from "next";
import "./globals.css";
import Nav from "./nav";
import { getCurriculum } from "@/lib/curriculum";

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
  const journey = await getCurriculum();
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav journey={journey} />
          <main className="content">
            <div className="col">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
