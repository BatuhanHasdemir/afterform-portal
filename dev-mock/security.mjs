import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SETTINGS } from './settings.mjs';

const pbkdf2Async = promisify(pbkdf2);

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SESSION_COOKIE = 'af_session';
export const CSRF_COOKIE = 'af_csrf';
export const CSRF_HEADER = 'X-CSRF-TOKEN';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function sendError(res, status, code, extra = {}) {
  if (extra.retryAfterSeconds !== undefined) {
    res.set('Retry-After', String(extra.retryAfterSeconds));
  }
  res.status(status).json({ code, ...extra });
}

export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.path === '/api' || req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
}

export function parseCookies(header) {
  const cookies = new Map();
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (cookies.has(name)) continue;
    try {
      cookies.set(name, decodeURIComponent(part.slice(index + 1).trim()));
    } catch {
      // A malformed cookie is treated as absent.
    }
  }
  return cookies;
}

function cookieOptions(req, sameSite) {
  return { httpOnly: true, sameSite, secure: req.secure, path: '/' };
}

export function clientIp(req) {
  return req.socket.remoteAddress ?? 'unknown';
}

// Sessions are opaque random ids mapped to a user in memory; the cookie carries nothing else.
export class SessionStore {
  #sessions = new Map();

  constructor({ idleMs }) {
    this.idleMs = idleMs;
  }

  create(userId) {
    const id = randomBytes(32).toString('base64url');
    this.#sessions.set(id, { userId, expiresAt: Date.now() + this.idleMs });
    return id;
  }

  resolve(id) {
    if (!id) return null;
    const session = this.#sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.#sessions.delete(id);
      return null;
    }
    session.expiresAt = Date.now() + this.idleMs;
    return session;
  }

  destroy(id) {
    if (id) this.#sessions.delete(id);
  }

  destroyForUser(userId) {
    for (const [id, session] of this.#sessions) {
      if (session.userId === userId) this.#sessions.delete(id);
    }
  }

  clear() {
    this.#sessions.clear();
  }

  writeCookie(req, res, id) {
    res.cookie(SESSION_COOKIE, id, cookieOptions(req, 'lax'));
  }

  clearCookie(req, res) {
    res.clearCookie(SESSION_COOKIE, cookieOptions(req, 'lax'));
  }
}

// Same idea as ASP.NET Core antiforgery: an HttpOnly cookie secret plus a request token that is
// bound to the current identity. Signing in or out changes the identity, so tokens issued before
// stop matching even if the cookie were somehow kept.
export class CsrfProtection {
  #key = randomBytes(32);

  issue(req, res) {
    let secret = req.cookies.get(CSRF_COOKIE);
    if (!isSecret(secret)) secret = this.rotate(req, res);
    return this.#token(secret, req.sessionId ?? '');
  }

  rotate(req, res) {
    const secret = randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE, secret, cookieOptions(req, 'strict'));
    return secret;
  }

  verify(req) {
    const secret = req.cookies.get(CSRF_COOKIE);
    const sent = req.get(CSRF_HEADER);
    if (!isSecret(secret) || typeof sent !== 'string' || sent === '') return false;
    const expected = Buffer.from(this.#token(secret, req.sessionId ?? ''));
    const actual = Buffer.from(sent);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  middleware() {
    return (req, res, next) => {
      if (!UNSAFE_METHODS.has(req.method) || this.verify(req)) return next();
      sendError(res, 400, 'csrf.invalid');
    };
  }

  #token(secret, binding) {
    return createHmac('sha256', this.#key).update(`${secret}\u0000${binding}`).digest('base64url');
  }
}

function isSecret(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export class FixedWindowLimiter {
  #hits = new Map();

  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  // Returns null when allowed, otherwise the seconds until the window resets.
  hit(key, now = Date.now()) {
    let entry = this.#hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.#hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.ceil((entry.resetAt - now) / 1000) : null;
  }

  clear() {
    this.#hits.clear();
  }
}

// Keyed by the normalised e-mail whether or not an account exists, so the response cannot
// reveal which addresses are registered.
export class LoginLockout {
  #entries = new Map();

  constructor({ maxFailures, lockMs }) {
    this.maxFailures = maxFailures;
    this.lockMs = lockMs;
  }

  // Seconds left on an active lock, or null.
  lockedFor(email, now = Date.now()) {
    const entry = this.#entries.get(email);
    if (!entry?.lockedUntil) return null;
    if (entry.lockedUntil <= now) {
      this.#entries.delete(email);
      return null;
    }
    return Math.ceil((entry.lockedUntil - now) / 1000);
  }

  // Like Identity's AccessFailedAsync: the failure that reaches the limit starts the lock and
  // resets the counter, so that very attempt is already answered as locked.
  recordFailure(email, now = Date.now()) {
    const entry = this.#entries.get(email) ?? { failures: 0, lockedUntil: null };
    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.failures = 0;
      entry.lockedUntil = now + this.lockMs;
    }
    this.#entries.set(email, entry);
    return this.lockedFor(email, now);
  }

  reset(email) {
    this.#entries.delete(email);
  }

  clear() {
    this.#entries.clear();
  }
}

const { algorithm, digest, iterations, saltBytes, keyBytes } = SETTINGS.password;

export async function hashPassword(password) {
  const salt = randomBytes(saltBytes);
  const hash = await pbkdf2Async(password, salt, iterations, keyBytes, digest);
  return {
    algorithm,
    iterations,
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  };
}

// The stored record carries its own parameters, so raising the iteration count later does not
// break existing passwords.
export async function verifyPassword(password, record) {
  if (record?.algorithm !== algorithm) return false;
  const expected = Buffer.from(record.hash, 'base64');
  const actual = await pbkdf2Async(
    password,
    Buffer.from(record.salt, 'base64'),
    record.iterations,
    expected.length,
    digest,
  );
  return timingSafeEqual(actual, expected);
}

// Unknown e-mails still pay for one PBKDF2 run, so response time does not reveal registration.
let dummyRecord = null;
export async function burnPasswordCheck(password) {
  dummyRecord ??= await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, dummyRecord);
  return false;
}
