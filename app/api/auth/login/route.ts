import { NextResponse } from 'next/server';
import { AuthError, readLoginBody, sameOrigin, sealSession, SESSION_COOKIE, signInToPortal } from '@/lib/server/auth-session';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Хүсэлтийн эх сурвалж буруу.' }, { status: 403 });
  try {
    const { username, password } = await readLoginBody(request);
    const session = await signInToPortal(username, password, new URL(request.url).origin);
    const value = await sealSession(session);
    const response = NextResponse.json({ username: session.username }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, value, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
      expires: new Date(session.expiresAt),
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthError ? error.message : 'Нэвтрэх үйлчилгээ түр бэлэн биш байна.' }, {
      status: error instanceof AuthError ? error.status : 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
