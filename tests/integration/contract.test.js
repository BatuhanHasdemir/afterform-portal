import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { toneMp3 } from '../../dev-mock/make-fixtures.mjs';
import { OPENAPI, openapiYaml } from '../../dev-mock/openapi.mjs';
import { apiRoutes } from '../../dev-mock/routes/api.mjs';
import { ADMIN, ARTIST, startMock } from './helpers.js';
import { validate } from './schema.js';

// docs/openapi.yaml and the mock mirror each other: every documented operation has a route and
// every route is documented; every answer the mock gives is a documented status with a body that
// matches its schema; and every documented status is actually produced by one of these tests.

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const MAX_UPLOAD_BYTES = 64 * 1024;

let mock;
before(async () => {
  mock = await startMock({ maxUploadBytes: MAX_UPLOAD_BYTES });
});
after(async () => {
  await mock?.stop();
});
beforeEach(async () => {
  await mock.reset();
});

/** "METHOD /path status" of every answer checked so far. */
const seen = new Set();

function operations() {
  return Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => item[method]).map((method) => ({ method: method.toUpperCase(), path, operation: item[method] })),
  );
}

/**
 * Sends a request and holds the answer against the document: its status must be listed for the
 * operation, listed headers must be present, and a JSON body must match the listed schema.
 */
async function call(client, method, template, { params = {}, query = '', json, body, headers, csrf } = {}) {
  const operation = OPENAPI.paths[template]?.[method.toLowerCase()];
  assert.ok(operation, `${method} ${template} is documented`);
  const path = template.replace(/\{(\w+)\}/g, (_, name) => encodeURIComponent(params[name]));
  const res = await client.fetch(`/api${path}${query}`, { method, json, body, headers, csrf });
  const label = `${method} ${template} -> ${res.status}`;
  const response = operation.responses[String(res.status)];
  assert.ok(response, `${label} is not in the document`);
  seen.add(`${method} ${template} ${res.status}`);

  for (const name of Object.keys(response.headers ?? {})) assert.ok(res.headers.has(name), `${label}: ${name} header`);
  if (!response.content) {
    assert.equal((await res.clone().arrayBuffer()).byteLength, 0, `${label}: no body`);
    return res;
  }
  const type = res.headers.get('content-type')?.split(';')[0].trim();
  assert.ok(type && response.content[type], `${label}: content type ${type}`);
  if (type === 'application/json') {
    assert.deepEqual(validate(response.content[type].schema, await res.clone().json(), OPENAPI), [], label);
  }
  return res;
}

/** A request meant to be well formed: its JSON body is held against the request schema first. */
function send(client, method, template, json, options = {}) {
  const schema = OPENAPI.paths[template][method.toLowerCase()].requestBody.content['application/json'].schema;
  assert.deepEqual(validate(schema, json, OPENAPI), [], `${method} ${template} request body`);
  return call(client, method, template, { ...options, json });
}

test('docs/openapi.yaml is the current output of dev-mock/openapi.mjs', () => {
  const file = readFileSync(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(file, openapiYaml(), 'run npm run openapi');
});

test('every route of the mock is documented, and every documented operation has a route', () => {
  const routed = [];
  for (const layer of apiRoutes(mock.ctx).stack) {
    for (const inner of layer.handle?.stack ?? []) {
      if (!inner.route) continue;
      for (const method of Object.keys(inner.route.methods)) {
        routed.push(`${method.toUpperCase()} ${inner.route.path.replace(/:(\w+)/g, '{$1}')}`);
      }
    }
  }
  assert.ok(routed.length > 10);
  assert.deepEqual(routed.sort(), operations().map(({ method, path }) => `${method} ${path}`).sort());
});

test('the schemas are strict enough to catch a wrong answer', () => {
  const demoSchema = OPENAPI.components.schemas.Demo;
  const demo = {
    id: 'x', title: 'T', genre: 'rock', note: '', status: 'pending', statusNote: null,
    createdAt: '2026-10-28T13:18:00Z', updatedAt: '2026-10-28T13:18:00Z',
    file: { originalName: 'a.mp3', sizeBytes: 1, contentType: 'audio/mpeg', sha256: 'a'.repeat(64) },
  };
  const { title: _title, ...untitled } = demo;
  assert.deepEqual(validate(demoSchema, demo, OPENAPI), []);
  for (const wrong of [
    { ...demo, extra: 1 },
    { ...demo, status: 'approved' },
    { ...demo, statusNote: 5 },
    { ...demo, createdAt: '2026-10-28 13:18' },
    { ...demo, file: { ...demo.file, sha256: 'A'.repeat(64) } },
    untitled,
  ]) {
    assert.notDeepEqual(validate(demoSchema, wrong, OPENAPI), [], JSON.stringify(wrong));
  }
  const notFound = OPENAPI.paths['/demos/{id}'].get.responses['404'].content['application/json'].schema;
  assert.deepEqual(validate(notFound, { code: 'demo.not_found' }, OPENAPI), []);
  assert.notDeepEqual(validate(notFound, { code: 'not_found' }, OPENAPI), []);
  assert.notDeepEqual(validate(notFound, { code: 'demo.not_found', message: 'free text' }, OPENAPI), []);
});

test('session, registration and password answers', async () => {
  const guest = mock.client();
  await call(guest, 'GET', '/csrf');
  await call(guest, 'GET', '/me');
  for (const { method, path } of operations().filter((op) => op.method !== 'GET')) {
    await call(guest, method, path, { params: { id: 'any' }, csrf: false });
  }
  for (const { method, path } of operations().filter((op) => op.operation.security.length > 0)) {
    await call(guest, method, path, { params: { id: 'any' } });
  }

  const account = { displayName: 'Sözleşme Testi', email: 'contract@afterform.test', password: 'contract-pass-01' };
  await send(guest, 'POST', '/auth/register', account);
  await call(guest, 'POST', '/auth/register', { json: { displayName: 'x', email: 'nope', password: 'short' } });
  await send(guest, 'POST', '/auth/register', account);

  await call(guest, 'POST', '/auth/login', { json: {} });
  await send(guest, 'POST', '/auth/login', { email: account.email, password: 'wrong-password-01' });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await send(guest, 'POST', '/auth/login', { email: 'nobody@afterform.test', password: 'wrong-password-01' });
  }
  assert.ok(seen.has('POST /auth/login 429'));
  await send(guest, 'POST', '/auth/login', { email: account.email, password: account.password });
  // Signing in and out replaces the CSRF token.
  guest.token = null;
  await call(guest, 'GET', '/me');
  await call(guest, 'POST', '/auth/logout');
  guest.token = null;

  for (let request = 1; request <= 6; request += 1) {
    await send(guest, 'POST', '/auth/forgot-password', { email: ARTIST.email });
  }
  assert.ok(seen.has('POST /auth/forgot-password 429'));
  const { items } = await (await fetch(`${mock.url}/dev/outbox`)).json();
  const link = new URL(items.at(-1).link, mock.url);
  const reset = { email: link.searchParams.get('email'), token: link.searchParams.get('token') };
  await call(guest, 'POST', '/auth/reset-password', { json: { ...reset, newPassword: 'short' } });
  await send(guest, 'POST', '/auth/reset-password', { ...reset, newPassword: 'new-artist-pass-01' });
  await send(guest, 'POST', '/auth/reset-password', { ...reset, newPassword: 'new-artist-pass-02' });
});

test('demo answers', async () => {
  const artist = mock.client();
  await artist.loginAs(ARTIST);
  const form = (bytes, name = 'take.mp3') => {
    const data = new FormData();
    data.set('title', 'Sözleşme');
    data.set('genre', 'rock');
    data.set('file', new Blob([bytes], { type: 'audio/mpeg' }), name);
    return data;
  };

  await call(artist, 'GET', '/demos', { query: '?status=pending&sort=title&page=1&pageSize=2' });
  await call(artist, 'GET', '/demos', { query: '?sort=random' });
  const created = await (await call(artist, 'POST', '/demos', { body: form(toneMp3({ frequency: 250, seconds: 0.5 })) })).json();
  await call(artist, 'POST', '/demos', { body: new FormData() });
  await call(artist, 'POST', '/demos', { body: form(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1)) });
  await call(artist, 'POST', '/demos', { body: form(Buffer.from('RIFF....WAVEfmt '), 'take.wav') });

  const params = { id: created.id };
  await call(artist, 'GET', '/demos/{id}', { params });
  await call(artist, 'GET', '/demos/{id}', { params: { id: 'does-not-exist' } });
  await call(artist, 'GET', '/demos/{id}/audio', { params });
  await call(artist, 'GET', '/demos/{id}/audio', { params, headers: { Range: 'bytes=0-99' } });
  await call(artist, 'GET', '/demos/{id}/audio', { params, headers: { Range: 'bytes=99999999-' } });
  await call(artist, 'GET', '/demos/{id}/audio', { params: { id: 'does-not-exist' } });
});

test('admin answers', async () => {
  const artist = mock.client();
  await artist.loginAs(ARTIST);
  const own = (await (await artist.fetch('/api/demos')).json()).items[0];
  const params = { id: own.id };
  await call(artist, 'GET', '/admin/demos');
  await call(artist, 'GET', '/admin/demos/{id}', { params });
  await call(artist, 'PATCH', '/admin/demos/{id}/status', { params, json: { status: 'accepted' } });

  const admin = mock.client();
  await admin.loginAs(ADMIN);
  await call(admin, 'GET', '/admin/demos', { query: '?q=mira&status=rejected&sort=updated' });
  await call(admin, 'GET', '/admin/demos', { query: '?page=0' });
  await call(admin, 'GET', '/admin/demos/{id}', { params });
  await call(admin, 'GET', '/admin/demos/{id}', { params: { id: 'does-not-exist' } });
  await send(admin, 'PATCH', '/admin/demos/{id}/status', { status: 'accepted', statusNote: 'Derlemeye alındı.' }, { params });
  await send(admin, 'PATCH', '/admin/demos/{id}/status', { status: 'in_review', statusNote: null }, { params });
  await call(admin, 'PATCH', '/admin/demos/{id}/status', { params, json: { status: 'approved' } });
  await send(admin, 'PATCH', '/admin/demos/{id}/status', { status: 'rejected' }, { params: { id: 'does-not-exist' } });
  await call(admin, 'GET', '/demos/{id}', { params });
});

test('every response the document lists was produced by the mock', () => {
  const documented = operations().flatMap(({ method, path, operation }) =>
    Object.keys(operation.responses).map((status) => `${method} ${path} ${status}`),
  );
  assert.deepEqual(documented.filter((key) => !seen.has(key)), []);
});
