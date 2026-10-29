// @ts-check
import { add32, rotl } from './bits.js';

// MD5 as written in RFC 1321, for comparison only: collisions can be produced at will, so it
// must not protect anything. Browsers offer no MD5; this module is checked against Node crypto.

/** RFC 1321 §3.4: T[i] is the integer part of 2^32 * |sin(i + 1)|, with i + 1 in radians. */
export const T = Object.freeze(Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32)));

/** RFC 1321 §3.3: words A, B, C, D (low-order byte first: 01 23 45 67, 89 ab cd ef, ...). */
export const H0 = Object.freeze([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);

/** Rotation amounts of the four rounds, each repeated four times within its round. */
const SHIFTS = [
  [7, 12, 17, 22],
  [5, 9, 14, 20],
  [4, 11, 16, 23],
  [6, 10, 15, 21],
];

/**
 * RFC 1321 §3.1–3.2: like SHA-2, except that the 64-bit length is written low-order byte first.
 * @param {Uint8Array} message
 */
export function pad(message) {
  const zeroBytes = (55 - (message.length % 64) + 64) % 64;
  const padded = new Uint8Array(message.length + 1 + zeroBytes + 8);
  padded.set(message);
  padded[message.length] = 0x80;
  const messageBits = message.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, messageBits >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(messageBits / 2 ** 32), true);
  return padded;
}

/**
 * @param {Uint8Array} message
 * @returns {Uint8Array} 16 bytes
 */
export function md5(message) {
  const padded = pad(message);
  const view = new DataView(padded.buffer);
  const state = [...H0];

  for (let offset = 0; offset < padded.length; offset += 64) {
    const X = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true));
    let [a, b, c, d] = state;
    for (let i = 0; i < 64; i += 1) {
      const round = i >> 4;
      // RFC 1321 §3.4: F, G, H and I, each reading the block's words in its own order.
      let f;
      let k;
      if (round === 0) {
        f = (b & c) | (~b & d);
        k = i;
      } else if (round === 1) {
        f = (b & d) | (c & ~d);
        k = (5 * i + 1) % 16;
      } else if (round === 2) {
        f = b ^ c ^ d;
        k = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        k = (7 * i) % 16;
      }
      const next = add32(b, rotl(add32(a, f >>> 0, X[k], T[i]), SHIFTS[round][i % 4]));
      [a, b, c, d] = [d, next, b, c];
    }
    state[0] = add32(state[0], a);
    state[1] = add32(state[1], b);
    state[2] = add32(state[2], c);
    state[3] = add32(state[3], d);
  }

  const digest = new Uint8Array(16);
  const out = new DataView(digest.buffer);
  state.forEach((word, i) => out.setUint32(i * 4, word, true));
  return digest;
}
