import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, test } from 'node:test';
import { add32 } from '../../web/js/lab/bits.js';
import { bytesToHex, bytesToWords, hex32, utf8Bytes } from '../../web/js/lab/hex.js';
import { H0, K, firstPrimes, invertRound, pad, sha256, sha256Trace } from '../../web/js/lab/sha256.js';

const nodeSha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ours = (bytes) => bytesToHex(sha256(bytes));

describe('SHA-256 against the vectors of ARCHITECTURE §10', () => {
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ];
  for (const [input, expected] of vectors) {
    test(JSON.stringify(input), () => {
      assert.equal(ours(utf8Bytes(input)), expected);
      assert.equal(nodeSha256(input), expected);
    });
  }
});

describe('SHA-256 against Node crypto', () => {
  const BOUNDARIES = [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128];

  test('the 13 padding boundary lengths', () => {
    for (const length of BOUNDARIES) {
      for (const bytes of [randomBytes(length), new Uint8Array(length).fill(0x61), new Uint8Array(length)]) {
        assert.equal(ours(bytes), nodeSha256(bytes), `length ${length}: ${Buffer.from(bytes).toString('hex')}`);
      }
    }
  });

  test('500 random inputs up to 300 bytes', () => {
    for (let i = 0; i < 500; i += 1) {
      const bytes = randomBytes(randomInt(0, 301));
      assert.equal(ours(bytes), nodeSha256(bytes), Buffer.from(bytes).toString('hex'));
    }
  });

  test('UTF-8 text, including Turkish letters', () => {
    for (const text of ['Biçimden sonra gelen ses.', 'İıĞğŞş', '🎵']) {
      assert.equal(ours(utf8Bytes(text)), nodeSha256(text));
    }
  });
});

describe('constants', () => {
  test('match the published FIPS 180-4 values', () => {
    assert.deepEqual(H0.map(hex32), ['6a09e667', 'bb67ae85', '3c6ef372', 'a54ff53a', '510e527f', '9b05688c', '1f83d9ab', '5be0cd19']);
    assert.equal(K.length, 64);
    assert.deepEqual([K[0], K[1], K[2], K[63]].map(hex32), ['428a2f98', '71374491', 'b5c0fbcf', 'c67178f2']);
  });

  // An independent check of the derivation: with n the integer root, n * 2^32 + x must be the
  // largest number whose square (cube) does not exceed p * 2^64 (p * 2^96).
  test('are exactly the first 32 fractional bits of the prime roots', () => {
    const check = (constants, count, degree) => {
      firstPrimes(count).forEach((prime, i) => {
        const p = BigInt(prime);
        let n = 0n;
        while ((n + 1n) ** degree <= p) n += 1n;
        const root = (n << 32n) + BigInt(constants[i]);
        const target = p << (32n * degree);
        assert.ok(root ** degree <= target && (root + 1n) ** degree > target, `prime ${prime}`);
      });
    };
    check(H0, 8, 2n);
    check(K, 64, 3n);
  });

  test('come from the first primes', () => {
    assert.deepEqual(firstPrimes(10), [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
    assert.equal(firstPrimes(64).at(-1), 311);
  });
});

describe('sha256Trace', () => {
  test('padding: one block up to 55 bytes, two from 56', () => {
    assert.deepEqual(pad(utf8Bytes('abc')).padding, { messageBits: 24, zeroBytes: 52, totalBytes: 64 });
    assert.deepEqual(pad(new Uint8Array(55)).padding, { messageBits: 440, zeroBytes: 0, totalBytes: 64 });
    assert.deepEqual(pad(new Uint8Array(56)).padding, { messageBits: 448, zeroBytes: 63, totalBytes: 128 });
    assert.deepEqual(pad(new Uint8Array(64)).padding, { messageBits: 512, zeroBytes: 55, totalBytes: 128 });
    const { padded } = pad(utf8Bytes('abc'));
    assert.equal(padded[3], 0x80);
    assert.deepEqual([...padded.slice(56)], [0, 0, 0, 0, 0, 0, 0, 24]);
  });

  test('is internally consistent and ends in the real digest', () => {
    for (const length of [0, 3, 55, 56, 64, 130]) {
      const message = randomBytes(length);
      const trace = sha256Trace(message);
      assert.equal(bytesToHex(trace.digest), nodeSha256(message));
      assert.equal(trace.blocks.length, trace.padding.totalBytes / 64);
      let hIn = [...H0];
      for (const block of trace.blocks) {
        assert.deepEqual(block.words, bytesToWords(trace.padded, block.index * 64, 16));
        assert.equal(block.schedule.length, 64);
        assert.deepEqual(block.schedule.slice(0, 16), block.words);
        assert.equal(block.rounds.length, 64);
        assert.deepEqual(block.rounds[0].before, hIn);
        block.rounds.forEach((round, t) => {
          assert.equal(round.t, t);
          assert.equal(round.K, K[t]);
          assert.equal(round.W, block.schedule[t]);
          if (t > 0) assert.deepEqual(round.before, block.rounds[t - 1].after);
          assert.equal(round.after[0], add32(round.T1, round.T2));
          assert.equal(round.after[4], add32(round.before[3], round.T1));
        });
        const last = block.rounds[63].after;
        assert.deepEqual(block.H, hIn.map((value, i) => add32(value, last[i])), 'feed-forward');
        hIn = block.H;
      }
    }
  });

  test('records the intermediate values of the FIPS 180-4 "abc" example', () => {
    const [block] = sha256Trace(utf8Bytes('abc')).blocks;
    assert.equal(hex32(block.schedule[0]), '61626380');
    assert.equal(hex32(block.schedule[15]), '00000018');
    assert.deepEqual(block.rounds[0].after.map(hex32), ['5d6aebcd', '6a09e667', 'bb67ae85', '3c6ef372', 'fa2a4622', '510e527f', '9b05688c', '1f83d9ab']);
    assert.deepEqual(block.rounds[63].after.map(hex32), ['506e3058', 'd39a2165', '04d24d6c', 'b85e2ce9', '5ef50f24', 'fb121210', '948d25b6', '961f4894']);
  });

  test('every round can be undone; only the feed-forward stands in the way', () => {
    const [block] = sha256Trace(randomBytes(40)).blocks;
    let state = block.rounds[63].after;
    for (let t = 63; t >= 0; t -= 1) {
      state = invertRound(state, K[t], block.schedule[t]);
      assert.deepEqual(state, block.rounds[t].before, `round ${t}`);
    }
    assert.deepEqual(state, [...H0], 'running all rounds backwards recovers the input hash');
  });
});
