// @ts-check
import { add32, rotl } from './bits.js';
import { bytesToWords, wordsToBytes } from './hex.js';
import { ch, integerRoot, maj, pad } from './sha256.js';

// SHA-1 as written in FIPS 180-4 §6.1, for comparison: practical collisions have been shown, so
// it no longer protects signatures. Padding and word order are the same as SHA-256's.

/** FIPS 180-4 §4.2.1: the integer parts of 2^30 times √2, √3, √5 and √10. */
export const K = Object.freeze([2n, 3n, 5n, 10n].map((n) => Number(integerRoot(n << 60n, 2n))));

/** FIPS 180-4 §5.3.1. The first four words are MD5's starting values as well. */
export const H0 = Object.freeze([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);

/** @param {number} x @param {number} y @param {number} z */
const parity = (x, y, z) => (x ^ y ^ z) >>> 0;

/** FIPS 180-4 §4.1.1: Ch, Parity, Maj, Parity, twenty steps each. */
const FUNCTIONS = [ch, parity, maj, parity];

/**
 * @param {Uint8Array} message
 * @returns {Uint8Array} 20 bytes
 */
export function sha1(message) {
  const { padded } = pad(message);
  const H = [...H0];

  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = bytesToWords(padded, offset, 16);
    for (let t = 16; t < 80; t += 1) w.push(rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1));

    let [a, b, c, d, e] = H;
    for (let t = 0; t < 80; t += 1) {
      const stage = Math.floor(t / 20);
      const T = add32(rotl(a, 5), FUNCTIONS[stage](b, c, d), e, K[stage], w[t]);
      [a, b, c, d, e] = [T, a, rotl(b, 30), c, d];
    }
    H[0] = add32(H[0], a);
    H[1] = add32(H[1], b);
    H[2] = add32(H[2], c);
    H[3] = add32(H[3], d);
    H[4] = add32(H[4], e);
  }
  return wordsToBytes(H);
}
