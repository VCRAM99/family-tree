import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

function isProtected(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/tree" || pathname.startsWith("/tree/");
}

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);
  requestHeaders.set("x-method", request.method);
  requestHeaders.set("x-request-id", crypto.randomUUID());

  if (isProtected(request.nextUrl.pathname) && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
