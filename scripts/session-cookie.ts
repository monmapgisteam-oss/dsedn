// Supply only the value of a signed-in local browser's dsedn_session cookie via the environment.
export function sessionCookie() {
  const value = process.env.DSEDN_SESSION_COOKIE;
  if (!value || /[\r\n;]/.test(value)) throw new Error('Set DSEDN_SESSION_COOKIE to a valid local login cookie before running API verification.');
  return `dsedn_session=${value}`;
}
