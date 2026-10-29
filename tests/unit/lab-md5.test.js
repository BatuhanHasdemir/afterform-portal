import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, test } from 'node:test';
import { bytesToHex, hex32, utf8Bytes } from '../../web/js/lab/hex.js';
import { T, md5, pad } from '../../web/js/lab/md5.js';

const nodeMd5 = (bytes) => createHash('md5').update(bytes).digest('hex');
const ours = (bytes) => bytesToHex(md5(bytes));

describe('MD5 against the vectors', () => {
  // ARCHITECTURE §10, then the RFC 1321 appendix A.5 test suite.
  const vectors = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['1234567890'.repeat(8), '57edf4a22be3c955ac49da2e2107b67a'],
  ];
  for (const [input, expected] of vectors) {
    test(JSON.stringify(input), () => {
      assert.equal(ours(utf8Bytes(input)), expected);
      assert.equal(nodeMd5(input), expected);
    });
  }
});

describe('MD5 against Node crypto', () => {
  const BOUNDARIES = [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128];

  test('the 13 padding boundary lengths', () => {
    for (const length of BOUNDARIES) {
      for (const bytes of [randomBytes(length), new Uint8Array(length).fill(0x61), new Uint8Array(length)]) {
        assert.equal(ours(bytes), nodeMd5(bytes), `length ${length}: ${Buffer.from(bytes).toString('hex')}`);
      }
    }
  });

  test('500 random inputs up to 300 bytes', () => {
    for (let i = 0; i < 500; i += 1) {
      const bytes = randomBytes(randomInt(0, 301));
      assert.equal(ours(bytes), nodeMd5(bytes), Buffer.from(bytes).toString('hex'));
    }
  });
});

describe('padding and constants', () => {
  test('the length goes last, low-order byte first', () => {
    const padded = pad(utf8Bytes('abc'));
    assert.equal(padded.length, 64);
    assert.equal(padded[3], 0x80);
    assert.deepEqual([...padded.subarray(56)], [24, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('T, computed from the sine, matches the table printed in RFC 1321', () => {
    assert.equal(T.length, 64);
    assert.deepEqual([T[0], T[1], T[2], T[31], T[32], T[63]].map(hex32), ['d76aa478', 'e8c7b756', '242070db', '8d2a4c8a', 'fffa3942', 'eb86d391']);
  });
});
