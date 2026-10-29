import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import * as api from '../../web/js/core/api.js';
import * as csrf from '../../web/js/core/csrf.js';
import { ApiError } from '../../web/js/core/errors.js';

// api.js runs against stand-ins for the browser globals it touches: fetch, location and
// XMLHttpRequest. Each test scripts the server's answers in order.

const originalFetch = globalThis.fetch;
let requests;
let answers;

function json(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const csrfAnswer = (token) => () => json(200, { token });

beforeEach(() => {
  requests = [];
  answers = [];
  csrf.reset();
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? 'GET', headers: { ...init.headers }, init });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected request: ${init.method} ${url}`);
    return next(url, init);
  };
  globalThis.location = {
    pathname: '/portal/demos.html',
    search: '?status=pending',
    assigned: [],
    assign(url) {
      this.assigned.push(url);
    },
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.location;
  assert.equal(answers.length, 0, 'every scripted answer was used');
});

describe('requests', () => {
  test('GET parses JSON, sends same-origin credentials and drops empty query values', async () => {
    answers.push(() => json(200, { items: [], total: 0, page: 2, pageSize: 20 }));
    const page = await api.get('/demos', { query: { status: 'pending', sort: '', page: 2, q: null } });
    assert.deepEqual(page, { items: [], total: 0, page: 2, pageSize: 20 });
    assert.equal(requests[0].url, '/api/demos?status=pending&page=2');
    assert.equal(requests[0].init.credentials, 'same-origin');
    assert.equal(requests[0].init.cache, 'no-store');
    assert.equal(requests[0].headers['X-CSRF-TOKEN'], undefined);
  });

  test('state-changing requests get a CSRF token once and reuse it', async () => {
    answers.push(csrfAnswer('tok-1'), () => json(200, { ok: 1 }), () => new Response(null, { status: 204 }));
    assert.deepEqual(await api.post('/auth/login', { email: 'a@b.co', password: 'x' }), { ok: 1 });
    assert.equal(await api.post('/auth/logout'), null);

    assert.deepEqual(requests.map((r) => `${r.method} ${r.url}`), [
      'GET /api/csrf',
      'POST /api/auth/login',
      'POST /api/auth/logout',
    ]);
    assert.equal(requests[1].headers['X-CSRF-TOKEN'], 'tok-1');
    assert.equal(requests[1].headers['Content-Type'], 'application/json');
    assert.equal(requests[1].init.body, '{"email":"a@b.co","password":"x"}');
    assert.equal(requests[2].headers['X-CSRF-TOKEN'], 'tok-1');
  });

  test('csrf.invalid refreshes the token and retries exactly once', async () => {
    answers.push(
      csrfAnswer('stale'),
      () => json(400, { code: 'csrf.invalid' }),
      csrfAnswer('fresh'),
      () => json(200, { status: 'accepted' }),
    );
    const result = await api.patch('/admin/demos/7/status', { status: 'accepted' });
    assert.deepEqual(result, { status: 'accepted' });
    assert.deepEqual(
      requests.filter((r) => r.method === 'PATCH').map((r) => r.headers['X-CSRF-TOKEN']),
      ['stale', 'fresh'],
    );
  });

  test('a second csrf.invalid is reported instead of looping', async () => {
    answers.push(
      csrfAnswer('a'),
      () => json(400, { code: 'csrf.invalid' }),
      csrfAnswer('b'),
      () => json(400, { code: 'csrf.invalid' }),
    );
    await assert.rejects(api.post('/auth/logout'), (error) => error instanceof ApiError && error.code === 'csrf.invalid');
    assert.equal(requests.filter((r) => r.method === 'POST').length, 2);
  });

  test('csrf.reset() makes the next request fetch a new token', async () => {
    answers.push(csrfAnswer('one'), () => json(200, {}), csrfAnswer('two'), () => json(200, {}));
    await api.post('/auth/login', {});
    csrf.reset();
    await api.post('/auth/logout');
    assert.equal(requests[3].headers['X-CSRF-TOKEN'], 'two');
  });
});

describe('error mapping', () => {
  test('validation errors keep only known field codes', async () => {
    answers.push(() =>
      json(400, {
        code: 'validation.failed',
        fields: { email: ['invalid_format', 'made_up'], displayName: ['too_short'], other: 'nope' },
        message: 'server text that must not travel',
      }),
    );
    const error = await api.get('/anything').catch((e) => e);
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'validation.failed');
    assert.deepEqual(error.fields, { email: ['invalid_format'], displayName: ['too_short'] });
    assert.equal(error.message, 'validation.failed');
  });

  test('retryAfterSeconds comes from the body, or else from Retry-After', async () => {
    answers.push(
      () => json(429, { code: 'auth.too_many_attempts', retryAfterSeconds: 899 }, { 'Retry-After': '899' }),
      () => json(429, { code: 'rate.limited' }, { 'Retry-After': '30' }),
    );
    const fromBody = await api.get('/x').catch((e) => e);
    assert.equal(fromBody.code, 'auth.too_many_attempts');
    assert.equal(fromBody.retryAfterSeconds, 899);
    const fromHeader = await api.get('/x').catch((e) => e);
    assert.equal(fromHeader.code, 'rate.limited');
    assert.equal(fromHeader.retryAfterSeconds, 30);
  });

  test('unknown codes and non-JSON failures become generic errors', async () => {
    answers.push(
      () => json(418, { code: 'teapot.brewing' }),
      () => new Response('<h1>Bad gateway</h1>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
      () => new Response('', { status: 429 }),
    );
    assert.equal((await api.get('/x').catch((e) => e)).code, 'server.error');
    assert.equal((await api.get('/x').catch((e) => e)).code, 'server.error');
    assert.equal((await api.get('/x').catch((e) => e)).code, 'rate.limited');
  });

  test('a failed connection becomes network.error', async () => {
    answers.push(() => {
      throw new TypeError('fetch failed');
    });
    const error = await api.get('/me').catch((e) => e);
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'network.error');
    assert.equal(error.status, 0);
  });

  test('an abort requested by the caller is passed through, not reported as network.error', async () => {
    answers.push((url, init) => {
      throw init.signal.reason ?? new DOMException('aborted', 'AbortError');
    });
    const controller = new AbortController();
    controller.abort();
    const error = await api.get('/demos', { signal: controller.signal }).catch((e) => e);
    assert.ok(!(error instanceof ApiError));
    assert.equal(error.name, 'AbortError');
  });
});

describe('unauthenticated responses', () => {
  test('auth.unauthenticated sends the user to sign in and back', async () => {
    answers.push(() => json(401, { code: 'auth.unauthenticated' }));
    await assert.rejects(api.get('/demos'), { code: 'auth.unauthenticated' });
    assert.deepEqual(location.assigned, ['/login.html?next=%2Fportal%2Fdemos.html%3Fstatus%3Dpending']);
  });

  test('the redirect can be turned off, e.g. for the session probe', async () => {
    answers.push(() => json(401, { code: 'auth.unauthenticated' }));
    await assert.rejects(api.get('/me', { redirectOnUnauthenticated: false }), { status: 401 });
    assert.deepEqual(location.assigned, []);
  });

  test('wrong credentials are a 401 too, but never redirect', async () => {
    answers.push(csrfAnswer('t'), () => json(401, { code: 'auth.invalid_credentials' }));
    await assert.rejects(api.post('/auth/login', {}), { code: 'auth.invalid_credentials' });
    assert.deepEqual(location.assigned, []);
  });
});

describe('upload', () => {
  class FakeXhr {
    static script = [];
    static sent = [];

    constructor() {
      this.headers = {};
      this.listeners = {};
      this.uploadListeners = {};
      this.upload = { addEventListener: (type, fn) => (this.uploadListeners[type] ??= []).push(fn) };
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    getResponseHeader(name) {
      return this.responseHeaders?.[name.toLowerCase()] ?? null;
    }
    send(body) {
      this.body = body;
      FakeXhr.sent.push(this);
      const step = FakeXhr.script.shift();
      queueMicrotask(() => step(this));
    }
    abort() {
      this.emit('abort');
    }
    emit(type, event = {}) {
      for (const fn of this.listeners[type] ?? []) fn(event);
    }
    progress(loaded, total) {
      for (const fn of this.uploadListeners.progress ?? []) fn({ lengthComputable: true, loaded, total });
    }
    reply(status, body, headers = {}) {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.responseHeaders = { 'content-type': 'application/json', ...headers };
      this.emit('load');
    }
  }

  beforeEach(() => {
    FakeXhr.script = [];
    FakeXhr.sent = [];
    globalThis.XMLHttpRequest = FakeXhr;
  });
  afterEach(() => {
    delete globalThis.XMLHttpRequest;
  });

  test('sends the CSRF header, reports progress and returns the created demo', async () => {
    answers.push(csrfAnswer('up-1'));
    FakeXhr.script.push((xhr) => {
      xhr.progress(50, 100);
      xhr.progress(100, 100);
      xhr.reply(201, { id: 'd1' });
    });
    const progress = [];
    const form = new FormData();
    const demo = await api.upload('/demos', form, { onProgress: (loaded, total) => progress.push([loaded, total]) });

    assert.deepEqual(demo, { id: 'd1' });
    assert.deepEqual(progress, [[50, 100], [100, 100]]);
    const [xhr] = FakeXhr.sent;
    assert.equal(xhr.method, 'POST');
    assert.equal(xhr.url, '/api/demos');
    assert.equal(xhr.headers['X-CSRF-TOKEN'], 'up-1');
    assert.equal(xhr.body, form);
  });

  test('maps errors like other requests and retries once on csrf.invalid', async () => {
    answers.push(csrfAnswer('old'), csrfAnswer('new'));
    FakeXhr.script.push(
      (xhr) => xhr.reply(400, { code: 'csrf.invalid' }),
      (xhr) => xhr.reply(413, { code: 'upload.too_large' }),
    );
    await assert.rejects(api.upload('/demos', new FormData()), { code: 'upload.too_large', status: 413 });
    assert.deepEqual(FakeXhr.sent.map((xhr) => xhr.headers['X-CSRF-TOKEN']), ['old', 'new']);
  });

  test('can be cancelled through an AbortSignal', async () => {
    answers.push(csrfAnswer('t'));
    const controller = new AbortController();
    FakeXhr.script.push(() => controller.abort());
    const error = await api.upload('/demos', new FormData(), { signal: controller.signal }).catch((e) => e);
    assert.equal(error.name, 'AbortError');
  });

  test('a dropped connection becomes network.error', async () => {
    answers.push(csrfAnswer('t'));
    FakeXhr.script.push((xhr) => xhr.emit('error'));
    await assert.rejects(api.upload('/demos', new FormData()), { code: 'network.error', status: 0 });
  });
});
