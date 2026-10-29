import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { VERIFY_MAX_BYTES } from '../../web/js/core/config.js';
import { canHashInBrowser, sameDigest, sha256OfFile } from '../../web/js/core/file-hash.js';

test('the browser-side digest of a file equals Node’s, in the API’s lower-case form', async () => {
  for (const bytes of [new Uint8Array(0), randomBytes(1), randomBytes(70_000)]) {
    assert.equal(await sha256OfFile(new Blob([bytes])), createHash('sha256').update(bytes).digest('hex'));
  }
});

test('files above the verification limit are not hashed in the browser', () => {
  assert.equal(canHashInBrowser({ size: VERIFY_MAX_BYTES }), true);
  assert.equal(canHashInBrowser({ size: VERIFY_MAX_BYTES + 1 }), false);
});

test('digests compare without regard to case', () => {
  const digest = createHash('sha256').update('abc').digest('hex');
  assert.equal(sameDigest(digest, digest.toUpperCase()), true);
  assert.equal(digest.at(-1), 'd');
  assert.equal(sameDigest(digest, `${digest.slice(0, -1)}e`), false);
});
