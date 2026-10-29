import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ARTIST, SEED, startMock } from './helpers.js';

let mock;
before(async () => {
  mock = await startMock();
});
after(async () => {
  await mock?.stop();
});

const readDb = () => {
  const text = readFileSync(join(mock.dataDir, 'db.json'), 'utf8');
  return { text, data: JSON.parse(text) };
};

test('passwords are stored as PBKDF2-HMAC-SHA512, 220,000 iterations, a distinct 16-byte salt each', () => {
  const { text, data } = readDb();
  const salts = new Set();

  for (const seeded of SEED.users) {
    assert.ok(!text.includes(seeded.password), `plaintext password of ${seeded.email} found`);
    const user = data.users.find((u) => u.email === seeded.email);
    const { algorithm, iterations, salt, hash } = user.password;
    assert.equal(algorithm, 'PBKDF2-HMAC-SHA512');
    assert.equal(iterations, 220000);

    const saltBytes = Buffer.from(salt, 'base64');
    assert.equal(saltBytes.length, 16);
    salts.add(salt);

    const expected = Buffer.from(hash, 'base64');
    const derived = pbkdf2Sync(seeded.password, saltBytes, iterations, expected.length, 'sha512');
    assert.deepEqual(derived, expected, `stored hash of ${seeded.email} does not verify`);
  }
  assert.equal(salts.size, SEED.users.length);
});

test('the same password registered twice gets two different records', async () => {
  const client = mock.client();
  for (const email of ['twin1@afterform.test', 'twin2@afterform.test']) {
    const res = await client.fetch('/api/auth/register', {
      method: 'POST',
      json: { displayName: 'Twin', email, password: 'identical-password' },
    });
    assert.equal(res.status, 201);
  }
  const { text, data } = readDb();
  assert.ok(!text.includes('identical-password'));
  const [a, b] = ['twin1@afterform.test', 'twin2@afterform.test'].map(
    (email) => data.users.find((u) => u.email === email).password,
  );
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('reset tokens are stored only as hashes', async () => {
  const client = mock.client();
  await client.fetch('/api/auth/forgot-password', { method: 'POST', json: { email: ARTIST.email } });
  const { items } = await (await fetch(`${mock.url}/dev/outbox`)).json();
  const token = new URL(items.at(-1).link, mock.url).searchParams.get('token');
  const { text, data } = readDb();
  assert.ok(token.length > 20);
  assert.ok(!text.includes(token));
  assert.match(data.resetTokens.at(-1).tokenHash, /^[0-9a-f]{64}$/);
});
