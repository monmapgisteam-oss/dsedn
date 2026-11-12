import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, unsealSession } from '@/lib/server/auth-session';

export async function proxy(request: NextRequest) {
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = session ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/workspace/:path*'] };
