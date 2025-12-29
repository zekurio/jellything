import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/invite", "/forgot-password", "/reset-password", "/verify-email"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get("session");

  // If no session and trying to access protected route, redirect to login
  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If at root with session, redirect to dashboard
  if (pathname === "/") {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*$).*)",
  ],
};
