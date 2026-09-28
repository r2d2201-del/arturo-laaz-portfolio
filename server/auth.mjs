import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) return false;
  const [scheme, salt, digest] = (hash || '').split(':');
  if (scheme !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(digest)) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
}
function signature(value, secret) { return createHmac('sha256', secret).update(value).digest('base64url'); }
export function createSession(secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + 8 * 3600_000, nonce: randomBytes(24).toString('hex') })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}
export function checkSession(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || !token || token.length > 1000) return false;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra) return false;
  const expected = signature(payload, secret);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url'));
    return typeof parsed.nonce === 'string' && parsed.exp > now && parsed.exp <= now + 8 * 3600_000;
  } catch { return false; }
}
export function sessionToken(req) {
  return (req.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('portfolio_session='))?.slice(18);
}
export function sessionCookie(token, secure, clear = false) {
  return `portfolio_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${clear ? 0 : 8 * 3600}${secure ? '; Secure' : ''}`;
}
export function sameOrigin(req) {
  return req.headers.get('origin') === new URL(req.url).origin && req.headers.get('x-portfolio-request') === '1';
}
