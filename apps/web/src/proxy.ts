import { type NextRequest, NextResponse } from 'next/server';

const SIGNED_IN_COOKIE = 'fp_signed_in';
const PROTECTED_PREFIXES = ['/account'];
const GUEST_ONLY_PATHS = ['/sign-in', '/sign-up'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SIGNED_IN_COOKIE);

  if (!signedIn && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = new URL('/sign-in', request.url);
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (signedIn && GUEST_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/account', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*', '/sign-in', '/sign-up'],
};
