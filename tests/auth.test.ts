import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { sealData } from 'iron-session';
import { NextRequest } from 'next/server';
import { AuthError, PORTAL_URL, SESSION_COOKIE, SESSION_SECONDS, readLoginBody, sealSession, signInToPortal, unsealSession, validatePortalSession, type PortalSession } from '../lib/server/auth-session';
import { POST as login } from '../app/api/auth/login/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { proxy } from '../proxy';

const origin = 'https://renewable.twincore.mn';
const secret = 'test-only-session-secret-'.repeat(3);
const sample = (): PortalSession => ({ username: 'portal-user', name: 'Test user', token: 'private-test-token', referer: origin, expiresAt: Date.now() + 60000 });
const request = (body: unknown, source = origin) => new Request(`${origin}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source }, body: JSON.stringify(body),
});
function configure(t: TestContext) {
  const old = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = secret;
  t.after(() => { if (old === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = old; });
}

test('Portal login sends credentials only in HTTPS POST bodies and bounds the provider expiry', async t => {
  configure(t); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++; assert.ok(url.startsWith(`${PORTAL_URL}/sharing/rest/`));
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(new Headers(init.headers).get('referer'), origin);
    const values = init.body as URLSearchParams;
    if (url.endsWith('/generateToken')) {
      assert.equal(values.get('username'), 'portal-user'); assert.equal(values.get('password'), 'test-password');
      assert.equal(values.get('client'), 'referer'); assert.equal(values.get('referer'), origin);
      return Response.json({ token: sample().token, expires: Date.now() + 86400000 });
    }
    assert.equal(values.get('token'), sample().token); assert.equal(values.has('password'), false);
    return Response.json({ username: 'portal-user', fullName: 'Test user' });
  });
  const session = await signInToPortal(' portal-user ', 'test-password', origin);
  assert.equal(session.username, 'portal-user'); assert.equal(calls, 2);
  assert.ok(session.expiresAt <= Date.now() + SESSION_SECONDS * 1000);
});

test('invalid credentials, disabled users and app keys cannot establish user sessions', async t => {
  configure(t);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 400, message: 'private provider details' } }));
  await assert.rejects(signInToPortal('user', 'bad-password', origin), (error: unknown) => error instanceof AuthError && error.status === 401 && !error.message.includes('private'));
  for (const identity of [{ appInfo: { appOwner: 'owner' } }, { username: 'user', disabled: true }]) {
    fetchMock.mock.mockImplementation(async (url: unknown) => Response.json(String(url).endsWith('/generateToken') ? { token: 'test', expires: Date.now() + 60000 } : identity));
    await assert.rejects(signInToPortal('user', 'password', origin), (error: unknown) => error instanceof AuthError && error.status === 401);
  }
});

test('sealed sessions hide tokens and reject tampering, expiration, malformed data and secret rotation', async t => {
  configure(t);
  const session = sample(); const sealed = await sealSession(session);
  assert.equal(sealed.includes(session.token), false); assert.deepEqual(await unsealSession(sealed), session);
  assert.equal(await unsealSession(sealed.slice(0, -8) + 'tampered'), null);
  const expired = await sealData({ ...session, expiresAt: Date.now() - 1 }, { password: secret, ttl: 60 });
  assert.equal(await unsealSession(expired), null);
  const incomplete = await sealData({ username: 'someone' }, { password: secret, ttl: 60 });
  assert.equal(await unsealSession(incomplete), null);
  process.env.SESSION_SECRET = 'rotated-secret-'.repeat(5);
  assert.equal(await unsealSession(sealed), null);
  delete process.env.SESSION_SECRET;
  assert.equal(await unsealSession(sealed), null);
  await assert.rejects(sealSession(session), (error: unknown) => error instanceof AuthError && error.status === 503);
});

test('protected access rechecks provider revocation and never accepts a different identity', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ username: 'portal-user' }));
  const session = sample(); assert.deepEqual(await validatePortalSession(session), session);
  for (const identity of [{ error: { code: 498 } }, { username: 'another-user' }, { username: 'portal-user', disabled: true }]) {
    fetchMock.mock.mockImplementation(async () => Response.json(identity));
    assert.equal(await validatePortalSession(session), null);
  }
  fetchMock.mock.mockImplementation(async () => { throw new Error('private-test-token'); });
  await assert.rejects(validatePortalSession(session), (error: unknown) => error instanceof AuthError && error.status === 503 && !error.message.includes(session.token));
});

test('login returns an encrypted HttpOnly cookie without credentials in JSON, and logout deletes it', async t => {
  configure(t);
  const oldMode = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'production' });
  t.after(() => { if (oldMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: oldMode }); });
  t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(url.endsWith('/generateToken') ? { token: sample().token, expires: sample().expiresAt } : { username: 'portal-user', fullName: 'Test user' }));
  const response = await login(request({ username: 'portal-user', password: 'test-password' }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { username: 'portal-user' });
  const cookie = response.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/']) assert.ok(cookie.toLowerCase().includes(flag.toLowerCase()));
  assert.equal(cookie.includes(sample().token), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const session = await unsealSession(response.cookies.get(SESSION_COOKIE)?.value);
  assert.equal(session?.username, 'portal-user');
  const signedOut = await logout(new Request(`${origin}/api/auth/logout`, { method: 'POST', headers: { Origin: origin } }));
  assert.equal(signedOut.status, 303); assert.equal(signedOut.headers.get('location'), `${origin}/`);
  assert.match(signedOut.headers.get('set-cookie')!, /Max-Age=0/i);
});

test('cross-site login/logout and oversized or malformed login requests fail before provider calls', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not call Portal'); });
  assert.equal((await login(request({ username: 'user', password: 'password' }, 'https://other.example'))).status, 403);
  assert.equal((await logout(new Request(`${origin}/api/auth/logout`, { method: 'POST' }))).status, 403);
  assert.equal((await login(request({ username: 'a'.repeat(9000), password: 'password' }))).status, 413);
  assert.equal((await login(new Request(`${origin}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  await assert.rejects(readLoginBody(new Request(origin, { method: 'POST', body: 'text' })), (error: unknown) => error instanceof AuthError && error.status === 415);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('workspace redirect rejects absent and forged cookies while authentic cookies can reach the server guard', async t => {
  configure(t);
  for (const cookie of ['', `${SESSION_COOKIE}=forged`]) {
    const response = await proxy(new NextRequest(`${origin}/workspace`, { headers: { Cookie: cookie } }));
    assert.equal(response.status, 307); assert.equal(response.headers.get('location'), `${origin}/login`);
  }
  const cookie = await sealSession(sample());
  const response = await proxy(new NextRequest(`${origin}/workspace`, { headers: { Cookie: `${SESSION_COOKIE}=${cookie}` } }));
  assert.equal(response.headers.get('x-middleware-next'), '1');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
