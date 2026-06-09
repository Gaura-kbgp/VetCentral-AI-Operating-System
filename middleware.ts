import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Forwards the current pathname as a request header so server components
// (e.g. the dashboard layout) can read it without needing params/searchParams.
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
