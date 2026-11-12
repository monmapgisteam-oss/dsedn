import { sealData, unsealData } from 'iron-session';
import { PORTAL_URL } from './enterprise';

export { PORTAL_URL };
export const SESSION_COOKIE = 'dsedn_session';
export const SESSION_SECONDS = 2 * 60 * 60;
export type PortalSession = {
  username: string;
  name: string;
  token: string;
  referer: string;
  expiresAt: number;
};

export class AuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new AuthError('Нэвтрэх үйлчилгээ түр бэлэн биш байна.', 503);
  return secret;
}

export async function sealSession(session: PortalSession) {
  const ttl = Math.min(SESSION_SECONDS, Math.floor((session.expiresAt - Date.now()) / 1000));
  if (ttl <= 0) throw new AuthError('Нэвтрэх эрхийн хугацаа дууссан. Дахин нэвтэрнэ үү.', 401);
  const value = await sealData(session, { password: sessionSecret(), ttl });
  if (value.length > 3800) throw new AuthError('Нэвтрэх мэдээллийг хадгалж чадсангүй.', 503);
  return value;
}

export async function unsealSession(value?: string): Promise<PortalSession | null> {
  if (!value || value.length > 3800) return null;
  try {
    const session = await unsealData<PortalSession>(value, { password: sessionSecret(), ttl: SESSION_SECONDS });
    if (typeof session.username !== 'string' || !session.username || typeof session.name !== 'string' ||
        typeof session.token !== 'string' || !session.token || typeof session.referer !== 'string' ||
        !/^https?:\/\/[^/]+$/.test(session.referer) || typeof session.expiresAt !== 'number' ||
        !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null;
    return session as PortalSession;
  } catch { return null; }
}

async function portalPost(path: string, values: Record<string, string>, referer: string) {
  try {
    const response = await fetch(`${PORTAL_URL}/sharing/rest${path}`, {
      method: 'POST', body: new URLSearchParams({ f: 'json', ...values }),
      headers: { Referer: referer }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Portal unavailable');
    return await response.json();
  } catch { throw new AuthError('Байгууллагын GIS сервертэй холбогдсонгүй. Түр хүлээгээд дахин оролдоно уу.', 503); }
}

export async function validatePortalSession(session: PortalSession): Promise<PortalSession | null> {
  if (session.expiresAt <= Date.now()) return null;
  const identity = await portalPost('/community/self', { token: session.token }, session.referer);
  // App/API keys are not user sessions. Always revalidate against the fixed organization portal.
  if (identity.error || identity.disabled || !identity.username || identity.username !== session.username) return null;
  return session;
}

export async function signInToPortal(username: unknown, password: unknown, referer: string): Promise<PortalSession> {
  sessionSecret();
  if (typeof username !== 'string' || !username.trim() || username.length > 128 ||
      typeof password !== 'string' || !password || password.length > 1024) {
    throw new AuthError('Хэрэглэгчийн нэр, нууц үгээ оруулна уу.', 400);
  }
  const result = await portalPost('/generateToken', {
    username: username.trim(), password, client: 'referer', referer, expiration: String(SESSION_SECONDS / 60),
  }, referer);
  if (result.error || typeof result.token !== 'string' || !result.token ||
      typeof result.expires !== 'number' || !Number.isFinite(result.expires) || result.expires <= Date.now()) {
    throw new AuthError('Хэрэглэгчийн нэр эсвэл нууц үг буруу, эсвэл нэвтрэх эрх идэвхгүй байна.', 401);
  }
  const identity = await portalPost('/community/self', { token: result.token }, referer);
  if (identity.error || identity.disabled || typeof identity.username !== 'string' || !identity.username) {
    throw new AuthError('Байгууллагын Portal хэрэглэгчийн эрх баталгаажаагүй.', 401);
  }
  return {
    username: identity.username, name: typeof identity.fullName === 'string' ? identity.fullName : identity.username,
    token: result.token, referer, expiresAt: Math.min(result.expires, Date.now() + SESSION_SECONDS * 1000),
  };
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (origin === new URL(request.url).origin) return true;
  // `next dev` reports request.url as localhost even when visited via 127.0.0.1; the Host header is what the browser addressed.
  try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}

export async function readLoginBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new AuthError('Хүсэлтийн төрөл буруу.', 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError('Нэвтрэх мэдээлэл дутуу байна.', 400);
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new AuthError('Хүсэлт хэт том байна.', 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body as { username?: unknown; password?: unknown };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('Нэвтрэх мэдээллийн формат буруу.', 400);
  } finally { reader.releaseLock(); }
}
