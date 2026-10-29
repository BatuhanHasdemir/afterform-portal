import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import * as csrf from '../../web/js/core/csrf.js';
import {
  adminListQueryString,
  changeStatus,
  getAdminDemo,
  readAdminListQuery,
  statusChangeBody,
} from '../../web/js/services/admin.js';

describe('status change body', () => {
  test('a note is trimmed; a blank one is left out so the server clears it', () => {
    assert.deepEqual(statusChangeBody({ status: 'accepted', statusNote: '  Derlemeye alındı. ' }), {
      status: 'accepted',
      statusNote: 'Derlemeye alındı.',
    });
    assert.deepEqual(statusChangeBody({ status: 'rejected', statusNote: '' }), { status: 'rejected' });
    assert.deepEqual(statusChangeBody({ status: 'in_review', statusNote: ' \n\t ' }), { status: 'in_review' });
  });
});

describe('admin list query in the address', () => {
  test('adds a trimmed search to the shared list options', () => {
    const query = readAdminListQuery(new URLSearchParams('q=%20Mira%20&status=rejected&sort=title&page=2'));
    assert.deepEqual(query, { status: 'rejected', sort: 'title', page: 2, pageSize: 20, q: 'Mira' });
    assert.equal(readAdminListQuery(new URLSearchParams('')).q, '');
  });

  test('writes only what differs from the defaults and round-trips', () => {
    assert.equal(adminListQueryString({ status: null, sort: 'newest', page: 1, pageSize: 20, q: '' }), '');
    const query = { status: 'pending', sort: 'newest', page: 3, pageSize: 20, q: 'kırık saat&x' };
    const search = adminListQueryString(query);
    assert.equal(search, '?status=pending&page=3&q=k%C4%B1r%C4%B1k+saat%26x');
    assert.deepEqual(readAdminListQuery(new URLSearchParams(search)), query);
  });
});

describe('requests', () => {
  const originalFetch = globalThis.fetch;
  let requests;
  let answers;
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    requests = [];
    answers = [];
    csrf.reset();
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url, method: init.method ?? 'GET', headers: { ...init.headers }, body: init.body });
      return answers.shift()();
    };
    globalThis.location = { pathname: '/admin/', search: '', assign() {} };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.location;
    assert.equal(answers.length, 0, 'every scripted answer was used');
  });

  test('a single demo and a status change go to the admin endpoints with the id encoded', async () => {
    const saved = { id: 'a/b', status: 'accepted', statusNote: null, artist: { id: 'u1', displayName: 'Mira Kaya' } };
    answers.push(() => json(200, saved), () => json(200, { token: 't1' }), () => json(200, saved));

    assert.deepEqual(await getAdminDemo('a/b'), saved);
    assert.deepEqual(await changeStatus('a/b', { status: 'accepted', statusNote: '   ' }), saved);

    assert.deepEqual(
      requests.map(({ method, url }) => `${method} ${url}`),
      ['GET /api/admin/demos/a%2Fb', 'GET /api/csrf', 'PATCH /api/admin/demos/a%2Fb/status'],
    );
    assert.equal(requests[2].headers['X-CSRF-TOKEN'], 't1');
    assert.deepEqual(JSON.parse(requests[2].body), { status: 'accepted' });
  });
});
