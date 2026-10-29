import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, test } from 'node:test';
import { bytesToHex, hex32, utf8Bytes } from '../../web/js/lab/hex.js';
import { H0, K, sha1 } from '../../web/js/lab/sha1.js';

const nodeSha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');
const ours = (bytes) => bytesToHex(sha1(bytes));

describe('SHA-1 against the vectors', () => {
  // ARCHITECTURE §10, then the FIPS 180-4 example messages.
  const vectors = [
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '84983e441c3bd26ebaae4aa1f95129e5e54670f1'],
  ];
  for (const [input, expected] of vectors) {
    test(JSON.stringify(input), () => {
      assert.equal(ours(utf8Bytes(input)), expected);
      assert.equal(nodeSha1(input), expected);
    });
  }
});

describe('SHA-1 against Node crypto', () => {
  const BOUNDARIES = [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128];

  test('the 13 padding boundary lengths', () => {
    for (const length of BOUNDARIES) {
      for (const bytes of [randomBytes(length), new Uint8Array(length).fill(0x61), new Uint8Array(length)]) {
        assert.equal(ours(bytes), nodeSha1(bytes), `length ${length}: ${Buffer.from(bytes).toString('hex')}`);
      }
    }
  });

  test('500 random inputs up to 300 bytes', () => {
    for (let i = 0; i < 500; i += 1) {
      const bytes = randomBytes(randomInt(0, 301));
      assert.equal(ours(bytes), nodeSha1(bytes), Buffer.from(bytes).toString('hex'));
    }
  });
});

test('constants: K from the square roots of 2, 3, 5 and 10 matches FIPS 180-4', () => {
  assert.deepEqual(K.map(hex32), ['5a827999', '6ed9eba1', '8f1bbcdc', 'ca62c1d6']);
  assert.deepEqual(H0.map(hex32), ['67452301', 'efcdab89', '98badcfe', '10325476', 'c3d2e1f0']);
});
