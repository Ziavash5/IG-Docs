import { NextRequest, NextResponse } from "next/server";

/**
 * HTTP Basic auth gate for the operator console. Credentials come from ADMIN_USER /
 * ADMIN_PASSWORD. If they aren't configured, /admin is blocked entirely (fail closed)
 * so the console is never publicly exposed by accident.
 */
export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    return new NextResponse(
      "Admin auth not configured. Set ADMIN_USER and ADMIN_PASSWORD in the environment.",
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(":");
    if (decoded.slice(0, idx) === user && decoded.slice(idx + 1) === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="InterGest Admin"' },
  });
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
