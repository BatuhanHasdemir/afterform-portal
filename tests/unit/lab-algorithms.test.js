import assert from 'node:assert/strict';
import { createHash, getHashes } from 'node:crypto';
import { test } from 'node:test';
import { ALGORITHMS, algorithmById, webCryptoAlgorithms } from '../../web/js/lab/algorithms.js';

const NODE_NAMES = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha384: 'sha384', sha512: 'sha512', 'sha3-256': 'sha3-256' };

test('the table matches ARCHITECTURE §10', () => {
  assert.deepEqual(
    ALGORITHMS.map((a) => [a.name, a.digestBits, a.blockBits, a.structure, a.rounds, a.status]),
    [
      ['MD5', 128, 512, 'merkle-damgard', 64, 'broken'],
      ['SHA-1', 160, 512, 'merkle-damgard', 80, 'deprecated'],
      ['SHA-256', 256, 512, 'merkle-damgard', 64, 'secure'],
      ['SHA-384', 384, 1024, 'merkle-damgard', 80, 'secure'],
      ['SHA-512', 512, 1024, 'merkle-damgard', 80, 'secure'],
      ['SHA3-256', 256, null, 'sponge', 24, 'secure'],
    ],
  );
  assert.deepEqual(algorithmById('sha3-256')?.sponge, { rate: 1088, capacity: 512 });
  assert.equal(algorithmById('nope'), null);
});

test('digest sizes agree with real implementations', () => {
  const available = new Set(getHashes());
  for (const algorithm of ALGORITHMS) {
    const name = NODE_NAMES[algorithm.id];
    if (!available.has(name)) continue;
    assert.equal(createHash(name).update('x').digest().length * 8, algorithm.digestBits, algorithm.name);
  }
});

test('only SHA-1 and SHA-2 are offered through Web Crypto', () => {
  assert.deepEqual(webCryptoAlgorithms().map((a) => a.webCrypto), ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);
});
