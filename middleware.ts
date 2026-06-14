import { NextRequest, NextResponse } from "next/server";

/**
 * Two jobs:
 *  - HTTP Basic auth gate for /admin (fail closed if creds aren't configured).
 *  - Expose the URL's corridor (first path segment) as an x-corridor request header so
 *    server components can render the right corridor without a cookie. This keeps each
 *    corridor's content on its own crawlable URL (e.g. /germany/enter/...).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const user = process.env.ADMIN_USER;
    const pass = process.env.ADMIN_PASSWORD;
    if (!user || !pass) {
      return new NextResponse(
        "Admin auth not configured. Set ADMIN_USER and ADMIN_PASSWORD in the environment.",
        { status: 503 },
      );
    }
    const header = req.headers.get("authorization");
    let ok = false;
    if (header?.startsWith("Basic ")) {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      ok = decoded.slice(0, idx) === user && decoded.slice(idx + 1) === pass;
    }
    if (!ok) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="InterGest Admin"' },
      });
    }
  }

  const corridor = pathname.split("/")[1] ?? "";
  const headers = new Headers(req.headers);
  headers.set("x-corridor", corridor);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
