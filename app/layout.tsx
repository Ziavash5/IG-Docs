import type { Metadata } from "next";
import "./globals.css";

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
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <div className="brand">InterGest Canada</div>
            <ul>
              <li><a href="/">Overview</a></li>
              <li><a href="/corridors/dach">DACH corridor</a></li>
              <li style={{ paddingLeft: 12 }}>
                <a href="/corridors/dach/germany-branch-vs-subsidiary-canada">
                  Branch vs subsidiary
                </a>
              </li>
            </ul>
          </nav>
          <main className="content">
            <div className="col">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
