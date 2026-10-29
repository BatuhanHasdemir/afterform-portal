import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { ARTIST, errorBody, startMock } from './helpers.js';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; " +
  "media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

let mock;
before(async () => {
  mock = await startMock();
});
after(async () => {
  await mock?.stop();
});
beforeEach(async () => {
  await mock.reset();
});

test('csrf -> login -> me -> logout chain', async () => {
  const client = mock.client();
  const login = await client.login(ARTIST.email, ARTIST.password);
  assert.equal(login.status, 200);
  const { user } = await login.json();
  assert.deepEqual(Object.keys(user).sort(), ['displayName', 'email', 'id', 'role']);
  assert.equal(user.email, ARTIST.email);
  assert.equal(user.role, 'artist');

  const sessionCookie = login.headers.getSetCookie().find((c) => c.startsWith('af_session='));
  assert.match(sessionCookie, /;\s*HttpOnly/i);
  assert.match(sessionCookie, /;\s*SameSite=Lax/i);

  const me = await client.fetch('/api/me');
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), user);

  const logout = await client.fetch('/api/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 204);
  assert.deepEqual(await errorBody(await client.fetch('/api/me')), {
    status: 401,
    body: { code: 'auth.unauthenticated' },
  });
});

test('a session cookie is replaced on every sign-in', async () => {
  const client = mock.client();
  await client.loginAs(ARTIST);
  const first = client.cookies.get('af_session');
  await client.loginAs(ARTIST);
  assert.notEqual(client.cookies.get('af_session'), first);

  const stale = mock.client();
  stale.cookies.set('af_session', first);
  assert.equal((await stale.fetch('/api/me')).status, 401);
});

describe('failed sign-in lockout', () => {
  const cases = [
    ['a registered e-mail', ARTIST.email, ARTIST.password],
    ['an unregistered e-mail', 'nobody@afterform.test', 'any-password-123'],
  ];
  for (const [label, email, correctPassword] of cases) {
    test(`${label}: attempts 1-4 get 401, the 5th gets 429 and the lock holds`, async () => {
      const client = mock.client();
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        assert.deepEqual(await errorBody(await client.login(email, 'wrong-password-123')), {
          status: 401,
          body: { code: 'auth.invalid_credentials' },
        });
      }

      const fifth = await client.login(email, 'wrong-password-123');
      assert.equal(fifth.status, 429);
      const body = await fifth.json();
      assert.equal(body.code, 'auth.too_many_attempts');
      assert.equal(Number(fifth.headers.get('retry-after')), body.retryAfterSeconds);
      assert.ok(body.retryAfterSeconds > 14 * 60 && body.retryAfterSeconds <= 15 * 60);

      const withCorrectPassword = await client.login(email, correctPassword);
      assert.equal(withCorrectPassword.status, 429);
      assert.equal((await withCorrectPassword.json()).code, 'auth.too_many_attempts');
    });
  }

  test('the lock is keyed by the normalised e-mail and does not spread to others', async () => {
    const client = mock.client();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await client.login(ARTIST.email.toUpperCase(), 'wrong-password-123');
    }
    assert.equal((await client.login(ARTIST.email, ARTIST.password)).status, 429);
    assert.equal((await client.login('admin@afterform.test', 'wrong-password-123')).status, 401);
  });
});

test('more than 10 sign-in requests per minute from one IP get 429', async () => {
  const client = mock.client();
  for (let i = 0; i < 10; i += 1) {
    const res = await client.login(`visitor${i}@example.test`, 'wrong-password-123');
    assert.equal(res.status, 401);
  }
  const eleventh = await client.login('visitor10@example.test', 'wrong-password-123');
  assert.equal(eleventh.status, 429);
  const body = await eleventh.json();
  assert.equal(body.code, 'auth.too_many_attempts');
  const retryAfter = Number(eleventh.headers.get('retry-after'));
  assert.ok(retryAfter > 0 && retryAfter <= 60);
  assert.equal(body.retryAfterSeconds, retryAfter);
});

describe('CSRF', () => {
  test('a POST without the X-CSRF-TOKEN header gets 400 csrf.invalid', async () => {
    const client = mock.client();
    await client.csrfToken();
    const res = await client.fetch('/api/auth/login', {
      method: 'POST',
      json: { email: ARTIST.email, password: ARTIST.password },
      csrf: false,
    });
    assert.deepEqual(await errorBody(res), { status: 400, body: { code: 'csrf.invalid' } });
  });

  test('a token is only valid with the cookie it was issued for', async () => {
    const owner = mock.client();
    const other = mock.client();
    const token = await owner.csrfToken();
    await other.csrfToken();
    const res = await other.fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': token },
      csrf: false,
    });
    assert.equal(res.status, 400);
  });

  test('tokens issued before sign-in or sign-out stop working after it', async () => {
    const client = mock.client();
    const anonymousToken = await client.csrfToken();
    await client.loginAs(ARTIST);

    const stale = await client.fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': anonymousToken },
      csrf: false,
    });
    assert.deepEqual(await errorBody(stale), { status: 400, body: { code: 'csrf.invalid' } });

    const signedInToken = await client.csrfToken();
    assert.notEqual(signedInToken, anonymousToken);
    assert.equal((await client.fetch('/api/auth/logout', { method: 'POST' })).status, 204);

    const afterLogout = await client.fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': signedInToken },
      csrf: false,
    });
    assert.equal(afterLogout.status, 400);
  });
});

describe('registration', () => {
  test('invalid fields come back as machine-readable codes', async () => {
    const res = await mock.client().fetch('/api/auth/register', {
      method: 'POST',
      json: { displayName: 'A', email: 'not-an-email', password: 'short' },
    });
    assert.deepEqual(await errorBody(res), {
      status: 400,
      body: {
        code: 'validation.failed',
        fields: {
          displayName: ['too_short'],
          email: ['invalid_format'],
          password: ['too_short'],
        },
      },
    });
  });

  test('a taken e-mail gets 409, a new one can sign in', async () => {
    const client = mock.client();
    const taken = await client.fetch('/api/auth/register', {
      method: 'POST',
      json: { displayName: 'Copy Cat', email: ARTIST.email.toUpperCase(), password: 'long-enough-pass' },
    });
    assert.deepEqual(await errorBody(taken), { status: 409, body: { code: 'auth.email_taken' } });

    const created = await client.fetch('/api/auth/register', {
      method: 'POST',
      json: { displayName: 'New Artist', email: 'new@afterform.test', password: 'long-enough-pass' },
    });
    assert.equal(created.status, 201);
    const user = await client.loginAs({ email: 'new@afterform.test', password: 'long-enough-pass' });
    assert.equal(user.role, 'artist');
  });
});

describe('password reset', () => {
  test('forgot-password answers 202 for every address; the link works once', async () => {
    const client = mock.client();
    for (const email of ['nobody@afterform.test', ARTIST.email]) {
      const res = await client.fetch('/api/auth/forgot-password', { method: 'POST', json: { email } });
      assert.equal(res.status, 202);
    }
    const { items } = await (await fetch(`${mock.url}/dev/outbox`)).json();
    assert.equal(items.length, 1);
    assert.equal(items[0].to, ARTIST.email);

    const link = new URL(items[0].link, mock.url);
    assert.equal(link.pathname, '/reset-password.html');
    const body = {
      email: link.searchParams.get('email'),
      token: link.searchParams.get('token'),
      newPassword: 'a-brand-new-password',
    };

    const session = mock.client();
    await session.loginAs(ARTIST);

    assert.equal((await client.fetch('/api/auth/reset-password', { method: 'POST', json: body })).status, 204);
    assert.deepEqual(
      await errorBody(await client.fetch('/api/auth/reset-password', { method: 'POST', json: body })),
      { status: 400, body: { code: 'auth.reset_token_invalid' } },
    );

    assert.equal((await session.fetch('/api/me')).status, 401, 'open sessions end on reset');
    assert.equal((await client.login(ARTIST.email, ARTIST.password)).status, 401);
    assert.equal((await client.login(ARTIST.email, body.newPassword)).status, 200);
  });

  test('a wrong token and a weak new password are rejected', async () => {
    const client = mock.client();
    const wrongToken = await client.fetch('/api/auth/reset-password', {
      method: 'POST',
      json: { email: ARTIST.email, token: 'made-up', newPassword: 'a-brand-new-password' },
    });
    assert.deepEqual(await errorBody(wrongToken), {
      status: 400,
      body: { code: 'auth.reset_token_invalid' },
    });

    const weak = await client.fetch('/api/auth/reset-password', {
      method: 'POST',
      json: { email: ARTIST.email, token: 'made-up', newPassword: 'short' },
    });
    assert.deepEqual(await errorBody(weak), {
      status: 400,
      body: { code: 'validation.failed', fields: { newPassword: ['too_short'] } },
    });
  });

  test('forgot-password is limited to 5 requests per 15 minutes per IP', async () => {
    const client = mock.client();
    for (let i = 0; i < 5; i += 1) {
      const res = await client.fetch('/api/auth/forgot-password', {
        method: 'POST',
        json: { email: 'nobody@afterform.test' },
      });
      assert.equal(res.status, 202);
    }
    const sixth = await client.fetch('/api/auth/forgot-password', {
      method: 'POST',
      json: { email: 'nobody@afterform.test' },
    });
    assert.equal(sixth.status, 429);
    const body = await sixth.json();
    assert.equal(body.code, 'rate.limited');
    assert.equal(Number(sixth.headers.get('retry-after')), body.retryAfterSeconds);
  });
});

test('security headers are sent for pages and API responses', async () => {
  for (const path of ['/', '/api/me']) {
    const res = await fetch(mock.url + path);
    assert.equal(res.headers.get('content-security-policy'), CSP, path);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
  }
  assert.equal((await fetch(`${mock.url}/api/me`)).headers.get('cache-control'), 'no-store');
});

test('an unknown API path gets 404 not_found', async () => {
  assert.deepEqual(await errorBody(await fetch(`${mock.url}/api/nothing-here`)), {
    status: 404,
    body: { code: 'not_found' },
  });
});
