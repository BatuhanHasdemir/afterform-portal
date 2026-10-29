import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, test } from 'node:test';
import { bytesToHex, utf8Bytes } from '../../web/js/lab/hex.js';
import { RATE_BYTES, RHO_OFFSETS, ROUND_CONSTANTS, keccakF1600, pad, sha3_256 } from '../../web/js/lab/sha3.js';

const nodeSha3 = (bytes) => createHash('sha3-256').update(bytes).digest('hex');
const ours = (bytes) => bytesToHex(sha3_256(bytes));

describe('SHA3-256 against the vectors of ARCHITECTURE §10', () => {
  const vectors = [
    ['', 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a'],
    ['abc', '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'],
  ];
  for (const [input, expected] of vectors) {
    test(JSON.stringify(input), () => {
      assert.equal(ours(utf8Bytes(input)), expected);
      assert.equal(nodeSha3(input), expected);
    });
  }
});

describe('SHA3-256 against Node crypto', () => {
  // The SHA-2 boundaries, plus the ones of the 136-byte rate: one padding byte (135), a full
  // block of padding (136) and more than one block.
  const BOUNDARIES = [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 135, 136, 137, 271, 272, 273];

  test('padding boundary lengths', () => {
    for (const length of BOUNDARIES) {
      for (const bytes of [randomBytes(length), new Uint8Array(length).fill(0x61), new Uint8Array(length)]) {
        assert.equal(ours(bytes), nodeSha3(bytes), `length ${length}: ${Buffer.from(bytes).toString('hex')}`);
      }
    }
  });

  test('500 random inputs up to 300 bytes', () => {
    for (let i = 0; i < 500; i += 1) {
      const bytes = randomBytes(randomInt(0, 301));
      assert.equal(ours(bytes), nodeSha3(bytes), Buffer.from(bytes).toString('hex'));
    }
  });

  test('UTF-8 text, including Turkish letters', () => {
    for (const text of ['Biçimden sonra gelen ses.', 'İıĞğŞş', '🎵']) {
      assert.equal(ours(utf8Bytes(text)), nodeSha3(text));
    }
  });
});

describe('padding and permutation', () => {
  test('0x06 starts the padding and 0x80 ends the block; one byte of room gives 0x86', () => {
    const short = pad(utf8Bytes('abc'));
    assert.equal(short.length, RATE_BYTES);
    assert.equal(short[3], 0x06);
    assert.equal(short[RATE_BYTES - 1], 0x80);
    const tight = pad(new Uint8Array(RATE_BYTES - 1));
    assert.equal(tight.length, RATE_BYTES);
    assert.equal(tight[RATE_BYTES - 1], 0x86);
    assert.equal(pad(new Uint8Array(RATE_BYTES)).length, 2 * RATE_BYTES);
  });

  test('ρ offsets and ι constants, generated from their definitions, match FIPS 202', () => {
    assert.deepEqual(RHO_OFFSETS, [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]);
    assert.equal(ROUND_CONSTANTS.length, 24);
    const hex = (value) => value.toString(16).padStart(16, '0');
    assert.deepEqual([0, 1, 2, 22, 23].map((i) => hex(ROUND_CONSTANTS[i])), [
      '0000000000000001', '0000000000008082', '800000000000808a', '0000000080000001', '8000000080008008',
    ]);
  });

  test('Keccak-f[1600] of the all-zero state', () => {
    const state = new Array(25).fill(0n);
    keccakF1600(state);
    // First lanes of the known result for the zero state (Keccak team reference values).
    assert.equal(state[0].toString(16).padStart(16, '0'), 'f1258f7940e1dde7');
    assert.equal(state[1].toString(16).padStart(16, '0'), '84d5ccf933c0478a');
  });
});
