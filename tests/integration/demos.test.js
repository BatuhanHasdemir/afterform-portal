import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { toneMp3 } from '../../dev-mock/make-fixtures.mjs';
import { ADMIN, ARTIST, ARTIST2, errorBody, startMock } from './helpers.js';

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

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function demoForm({ title = 'Test Take', genre = 'rock', note, file, fileName = 'take.mp3', type = 'audio/mpeg' } = {}) {
  const form = new FormData();
  if (title !== undefined) form.set('title', title);
  if (genre !== undefined) form.set('genre', genre);
  if (note !== undefined) form.set('note', note);
  if (file) form.set('file', new Blob([file], { type }), fileName);
  return form;
}

async function firstDemoOf(client) {
  const page = await (await client.fetch('/api/demos')).json();
  return page.items[0];
}

test('requests without a session get 401 auth.unauthenticated', async () => {
  const client = mock.client();
  const requests = [
    ['GET', '/api/me'],
    ['GET', '/api/demos'],
    ['GET', '/api/demos/any-id'],
    ['GET', '/api/demos/any-id/audio'],
    ['POST', '/api/demos'],
    ['GET', '/api/admin/demos'],
    ['GET', '/api/admin/demos/any-id'],
    ['PATCH', '/api/admin/demos/any-id/status'],
  ];
  for (const [method, path] of requests) {
    const res = await client.fetch(path, { method });
    assert.deepEqual(await errorBody(res), { status: 401, body: { code: 'auth.unauthenticated' } }, `${method} ${path}`);
  }
});

describe('listing', () => {
  test('an artist sees only their own demos, in contract shape', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const page = await (await client.fetch('/api/demos')).json();
    assert.equal(page.total, 3);
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 20);
    assert.deepEqual(
      page.items.map((demo) => demo.status),
      ['pending', 'in_review', 'accepted'],
      'newest first by default',
    );
    const demo = page.items[0];
    assert.deepEqual(Object.keys(demo).sort(), [
      'createdAt', 'file', 'genre', 'id', 'note', 'status', 'statusNote', 'title', 'updatedAt',
    ]);
    assert.deepEqual(Object.keys(demo.file).sort(), ['contentType', 'originalName', 'sha256', 'sizeBytes']);
    assert.match(demo.file.sha256, /^[0-9a-f]{64}$/);
    assert.match(demo.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    const other = mock.client();
    await other.loginAs(ARTIST2);
    assert.equal((await (await other.fetch('/api/demos')).json()).total, 1);
  });

  test('filter, sort and paging parameters', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);

    const accepted = await (await client.fetch('/api/demos?status=accepted')).json();
    assert.deepEqual(accepted.items.map((d) => d.title), ['Kırık Saat']);

    const byTitle = await (await client.fetch('/api/demos?sort=title')).json();
    assert.deepEqual(byTitle.items.map((d) => d.title), ['Gece Yürüyüşü', 'Kırık Saat', 'Paralel Hat']);

    const oldest = await (await client.fetch('/api/demos?sort=oldest')).json();
    assert.equal(oldest.items[0].title, 'Kırık Saat');

    const secondPage = await (await client.fetch('/api/demos?page=2&pageSize=2')).json();
    assert.deepEqual(
      { total: secondPage.total, page: secondPage.page, pageSize: secondPage.pageSize, count: secondPage.items.length },
      { total: 3, page: 2, pageSize: 2, count: 1 },
    );
  });

  test('out-of-range or unknown parameters get validation.failed', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const res = await client.fetch('/api/demos?sort=random&status=lost&page=0&pageSize=101');
    assert.deepEqual(await errorBody(res), {
      status: 400,
      body: {
        code: 'validation.failed',
        fields: {
          status: ['invalid_value'],
          sort: ['invalid_value'],
          page: ['invalid_value'],
          pageSize: ['invalid_value'],
        },
      },
    });
  });
});

describe('ownership', () => {
  test("artist B gets 404 for artist A's demo and its audio, same as for a missing id", async () => {
    const owner = mock.client();
    await owner.loginAs(ARTIST);
    const demo = await firstDemoOf(owner);
    assert.equal((await owner.fetch(`/api/demos/${demo.id}`)).status, 200);

    const intruder = mock.client();
    await intruder.loginAs(ARTIST2);
    const notFound = { status: 404, body: { code: 'demo.not_found' } };
    assert.deepEqual(await errorBody(await intruder.fetch(`/api/demos/${demo.id}`)), notFound);
    assert.deepEqual(await errorBody(await intruder.fetch(`/api/demos/${demo.id}/audio`)), notFound);
    assert.deepEqual(await errorBody(await intruder.fetch('/api/demos/does-not-exist')), notFound);
  });

  test('an admin can open any demo and its audio', async () => {
    const owner = mock.client();
    await owner.loginAs(ARTIST2);
    const demo = await firstDemoOf(owner);

    const admin = mock.client();
    await admin.loginAs(ADMIN);
    assert.equal((await admin.fetch(`/api/demos/${demo.id}`)).status, 200);
    assert.equal((await admin.fetch(`/api/demos/${demo.id}/audio`)).status, 200);
  });
});

describe('audio', () => {
  test('a Range request gets 206 with exactly the requested bytes', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const demo = await firstDemoOf(client);

    const full = await client.fetch(`/api/demos/${demo.id}/audio`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal(full.headers.get('content-type'), 'audio/mpeg');
    assert.equal(full.headers.get('cache-control'), 'private, no-store');
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await full.arrayBuffer());
    assert.equal(bytes.length, demo.file.sizeBytes);
    assert.equal(sha256(bytes), demo.file.sha256);

    const partial = await client.fetch(`/api/demos/${demo.id}/audio`, { headers: { Range: 'bytes=1000-1999' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes 1000-1999/${bytes.length}`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(1000, 2000));

    const unsatisfiable = await client.fetch(`/api/demos/${demo.id}/audio`, {
      headers: { Range: `bytes=${bytes.length + 10}-` },
    });
    assert.equal(unsatisfiable.status, 416);
  });

  test('a stored record that is not audio is served as opaque bytes, never as markup', async () => {
    const client = mock.client();
    const user = await client.loginAs(ARTIST);
    const markup = Buffer.from('<script>alert(1)</script>');
    writeFileSync(join(mock.uploadsDir, 'markup.bin'), markup);
    mock.store.createDemo({
      id: 'markup',
      ownerId: user.id,
      title: 'Markup',
      genre: 'other',
      note: '',
      file: { originalName: 'x.html', sizeBytes: markup.length, contentType: 'text/html', sha256: sha256(markup), storedName: 'markup.bin' },
    });
    const audio = await client.fetch('/api/demos/markup/audio');
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get('content-type'), 'application/octet-stream');
  });
});

describe('upload', () => {
  test("the stored sha256 equals Node's digest of the uploaded bytes", async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const mp3 = toneMp3({ frequency: 417, seconds: 1 });

    const res = await client.fetch('/api/demos', {
      method: 'POST',
      body: demoForm({ title: '  Yeni Parça ', genre: 'pop', note: 'ilk deneme', file: mp3, fileName: 'yeni parça.mp3' }),
    });
    assert.equal(res.status, 201);
    const demo = await res.json();
    assert.equal(res.headers.get('location'), `/api/demos/${demo.id}`);
    assert.equal(demo.file.sha256, sha256(mp3));
    assert.equal(demo.file.sizeBytes, mp3.length);
    assert.equal(demo.file.originalName, 'yeni parça.mp3');
    assert.equal(demo.file.contentType, 'audio/mpeg');
    assert.equal(demo.title, 'Yeni Parça');
    assert.equal(demo.status, 'pending');
    assert.equal(demo.statusNote, null);

    const stored = await client.fetch(`/api/demos/${demo.id}/audio`);
    assert.equal(sha256(Buffer.from(await stored.arrayBuffer())), sha256(mp3));
    assert.equal((await (await client.fetch('/api/demos')).json()).total, 4);
  });

  test('path components are dropped from the file name', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const res = await client.fetch('/api/demos', {
      method: 'POST',
      body: demoForm({ file: toneMp3({ frequency: 250, seconds: 0.1 }), fileName: 'C:\\Users\\me\\take-3.mp3' }),
    });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).file.originalName, 'take-3.mp3');
  });

  test('the name and the first bytes decide the type, not the declared one', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const tagged = Buffer.concat([Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'), toneMp3({ frequency: 333, seconds: 0.1 })]);
    const res = await client.fetch('/api/demos', {
      method: 'POST',
      body: demoForm({ file: tagged, fileName: 'TAKE.MP3', type: 'application/octet-stream' }),
    });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).file.contentType, 'audio/mpeg');
  });

  test('anything that is not an MP3 file gets 415 and nothing is stored', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const before = readdirSync(mock.uploadsDir).length;
    const mp3 = toneMp3({ frequency: 250, seconds: 0.1 });
    const refused = [
      { file: Buffer.from('RIFF\u0024\u0000\u0000\u0000WAVEfmt ', 'latin1'), fileName: 'take.wav', type: 'audio/wav' },
      { file: Buffer.from('<script>alert(1)</script>'), fileName: 'take.mp3', type: 'audio/mpeg' },
      { file: mp3, fileName: 'take.wav', type: 'audio/mpeg' },
      { file: mp3, fileName: 'take', type: 'audio/mpeg' },
      { file: Buffer.from([0xff, 0xfb]), fileName: 'short.mp3', type: 'audio/mpeg' },
    ];
    for (const upload of refused) {
      const res = await client.fetch('/api/demos', { method: 'POST', body: demoForm(upload) });
      assert.deepEqual(await errorBody(res), { status: 415, body: { code: 'upload.unsupported_type' } }, upload.fileName);
    }
    assert.equal(readdirSync(mock.uploadsDir).length, before);
    assert.equal((await (await client.fetch('/api/demos')).json()).total, 3);
  });

  test('missing or invalid fields are reported per field and nothing is stored', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const res = await client.fetch('/api/demos', {
      method: 'POST',
      body: demoForm({ title: '', genre: 'polka', note: 'x'.repeat(1001) }),
    });
    assert.deepEqual(await errorBody(res), {
      status: 400,
      body: {
        code: 'validation.failed',
        fields: {
          title: ['required'],
          genre: ['invalid_value'],
          note: ['too_long'],
          file: ['required'],
        },
      },
    });
    assert.equal((await (await client.fetch('/api/demos')).json()).total, 3);
  });

  test('a file over the size limit gets 413 and leaves no partial file behind', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const before = readdirSync(mock.uploadsDir).length;
    const res = await client.fetch('/api/demos', {
      method: 'POST',
      body: demoForm({ file: Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1) }),
    });
    assert.deepEqual(await errorBody(res), { status: 413, body: { code: 'upload.too_large' } });
    assert.equal(readdirSync(mock.uploadsDir).length, before);
  });

  test('an upload without a CSRF token is refused before the body is read', async () => {
    const client = mock.client();
    await client.loginAs(ARTIST);
    const res = await client.fetch('/api/demos', {
      method: 'POST',
      body: demoForm({ file: Buffer.from('data') }),
      csrf: false,
    });
    assert.deepEqual(await errorBody(res), { status: 400, body: { code: 'csrf.invalid' } });
  });
});
