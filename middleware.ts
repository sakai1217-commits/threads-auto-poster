import { NextRequest, NextResponse } from "next/server";
import { verifySessionTokenEdge } from "@/lib/auth";

const PUBLIC_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/check", "/api/auth/reset-request", "/api/auth/reset-confirm", "/api/cron", "/api/setup", "/api/debug-threads"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // For page routes (non-API), let them through — frontend handles login UI
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // API routes require authentication
  const session = request.cookies.get("session");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET || "dev-fallback-secret-change-me";
  const result = await verifySessionTokenEdge(session.value, secret);

  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pass user ID to API routes via header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", result.userId.toString());

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
