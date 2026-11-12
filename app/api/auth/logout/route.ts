import { NextResponse } from 'next/server';
import { sameOrigin, SESSION_COOKIE } from '@/lib/server/auth-session';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Хүсэлтийн эх сурвалж буруу.' }, { status: 403 });
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: new Date(0), maxAge: 0,
  });
  return response;
}
