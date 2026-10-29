import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { ADMIN, ARTIST, ARTIST2, errorBody, startMock } from './helpers.js';

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

async function signedIn(user) {
  const client = mock.client();
  await client.loginAs(user);
  return client;
}

test('an artist gets 403 auth.forbidden on admin endpoints', async () => {
  const artist = await signedIn(ARTIST);
  const forbidden = { status: 403, body: { code: 'auth.forbidden' } };
  assert.deepEqual(await errorBody(await artist.fetch('/api/admin/demos')), forbidden);
  const own = (await (await artist.fetch('/api/demos')).json()).items[0];
  assert.deepEqual(await errorBody(await artist.fetch(`/api/admin/demos/${own.id}`)), forbidden, 'even for their own demo');
  assert.deepEqual(
    await errorBody(
      await artist.fetch('/api/admin/demos/any-id/status', { method: 'PATCH', json: { status: 'accepted' } }),
    ),
    forbidden,
  );
});

test('an admin lists every demo with its artist', async () => {
  const admin = await signedIn(ADMIN);
  const page = await (await admin.fetch('/api/admin/demos')).json();
  assert.equal(page.total, 4);
  for (const demo of page.items) {
    assert.deepEqual(Object.keys(demo.artist).sort(), ['displayName', 'id']);
  }
  assert.deepEqual(
    new Set(page.items.map((demo) => demo.artist.displayName)),
    new Set([ARTIST.displayName, ARTIST2.displayName]),
  );
});

test('an admin gets a single demo with its artist; unknown ids get 404', async () => {
  const artist = await signedIn(ARTIST2);
  const me = await (await artist.fetch('/api/me')).json();
  const demo = (await (await artist.fetch('/api/demos')).json()).items[0];

  const admin = await signedIn(ADMIN);
  const res = await admin.fetch(`/api/admin/demos/${demo.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ...demo, artist: { id: me.id, displayName: ARTIST2.displayName } });

  const missing = await admin.fetch('/api/admin/demos/does-not-exist');
  assert.deepEqual(await errorBody(missing), { status: 404, body: { code: 'demo.not_found' } });
});

test('admin filters: status, and search over title and artist name', async () => {
  const admin = await signedIn(ADMIN);
  const titles = async (query) =>
    (await (await admin.fetch(`/api/admin/demos?${query}`)).json()).items.map((demo) => demo.title);

  assert.deepEqual(await titles('status=rejected'), ['Northbound']);
  assert.deepEqual(await titles(`q=${encodeURIComponent('mira')}`), ['Northbound']);
  assert.deepEqual(await titles(`q=${encodeURIComponent('KIRIK')}`), ['Kırık Saat']);
  assert.deepEqual(await titles('q=yuruyusu'), ['Gece Yürüyüşü']);
});

test('a status change is visible to the artist; omitting the note clears it', async () => {
  const artist = await signedIn(ARTIST);
  const demo = (await (await artist.fetch('/api/demos?status=accepted')).json()).items[0];
  assert.equal(demo.statusNote, 'Ekim derlemesine alındı.');

  const admin = await signedIn(ADMIN);
  const changed = await admin.fetch(`/api/admin/demos/${demo.id}/status`, {
    method: 'PATCH',
    json: { status: 'rejected', statusNote: '  Derleme kapandı.  ' },
  });
  assert.equal(changed.status, 200);
  const body = await changed.json();
  assert.equal(body.status, 'rejected');
  assert.equal(body.statusNote, 'Derleme kapandı.');
  assert.equal(body.artist.displayName, ARTIST.displayName);
  assert.ok(body.updatedAt >= demo.updatedAt);

  const seen = await (await artist.fetch(`/api/demos/${demo.id}`)).json();
  assert.equal(seen.status, 'rejected');
  assert.equal(seen.statusNote, 'Derleme kapandı.');

  const withoutNote = await admin.fetch(`/api/admin/demos/${demo.id}/status`, {
    method: 'PATCH',
    json: { status: 'in_review' },
  });
  assert.equal((await withoutNote.json()).statusNote, null);
});

test('status changes are validated and unknown ids get 404', async () => {
  const admin = await signedIn(ADMIN);
  const anyDemo = (await (await admin.fetch('/api/admin/demos')).json()).items[0];

  const invalid = await admin.fetch(`/api/admin/demos/${anyDemo.id}/status`, {
    method: 'PATCH',
    json: { status: 'approved', statusNote: 'x'.repeat(501) },
  });
  assert.deepEqual(await errorBody(invalid), {
    status: 400,
    body: { code: 'validation.failed', fields: { status: ['invalid_value'], statusNote: ['too_long'] } },
  });

  const missing = await admin.fetch('/api/admin/demos/does-not-exist/status', {
    method: 'PATCH',
    json: { status: 'accepted' },
  });
  assert.deepEqual(await errorBody(missing), { status: 404, body: { code: 'demo.not_found' } });
});
