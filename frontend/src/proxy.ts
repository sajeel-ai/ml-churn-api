import { NextResponse, type NextRequest } from "next/server";

// Runtime API proxy + first-line route protection.
//
// 1. /api/* is proxied to the FastAPI backend. BACKEND_URL is read at RUNTIME
//    (not build time), so the same image works in every environment. The
//    browser only ever talks to this origin: the session cookie is first-party,
//    no CORS is needed and no backend secret or API key reaches the browser.
// 2. Visitors without a session cookie are redirected to /login. This is a UX
//    shortcut only: the backend verifies the session and the role on every
//    request, so removing or forging the cookie grants nothing.
const BACKEND = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const PROTECTED = ["/dashboard", "/predict", "/predictions", "/customers", "/bulk", "/model", "/settings", "/admin"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.rewrite(new URL(pathname + search, BACKEND));
  }

  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (needsAuth && !req.cookies.get("churn_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
