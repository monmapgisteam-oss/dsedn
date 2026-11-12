import { cookies } from 'next/headers';
import { AuthError, SESSION_COOKIE, unsealSession, validatePortalSession } from './auth-session';

export async function currentSession() {
  const session = await unsealSession((await cookies()).get(SESSION_COOKIE)?.value);
  return session ? validatePortalSession(session) : null;
}

export async function requireApiSession() {
  try {
    const session = await currentSession();
    if (session) return session;
    return Response.json({ error: 'Нэвтрэх эрхийн хугацаа дууссан. Дахин нэвтэрнэ үү.' }, {
      status: 401, headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof AuthError ? error.message : 'Нэвтрэх эрхийг шалгаж чадсангүй.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
