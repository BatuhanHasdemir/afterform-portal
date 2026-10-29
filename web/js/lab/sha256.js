// @ts-check
import { add32, rotr, shr } from './bits.js';
import { bytesToWords, wordsToBytes } from './hex.js';

// SHA-256 as written in FIPS 180-4, for showing its inner workings. Real digests in the
// portal and the Lab always come from Web Crypto; this module is cross-checked against it.

/**
 * @typedef {object} RoundTrace
 * @property {number} t
 * @property {number[]} before registers a..h entering the round
 * @property {number[]} after registers a..h leaving the round
 * @property {number} T1
 * @property {number} T2
 * @property {number} K
 * @property {number} W
 * @property {number} Ch
 * @property {number} Maj
 * @property {number} S0 Σ0(a)
 * @property {number} S1 Σ1(e)
 */

/**
 * @typedef {object} BlockTrace
 * @property {number} index
 * @property {number[]} words M[0..15]
 * @property {number[]} schedule W[0..63]
 * @property {RoundTrace[]} rounds
 * @property {number[]} H intermediate hash after this block (feed-forward applied)
 */

/**
 * @typedef {object} Sha256Trace
 * @property {{ messageBits: number, zeroBytes: number, totalBytes: number }} padding
 * @property {Uint8Array} padded
 * @property {BlockTrace[]} blocks
 * @property {Uint8Array} digest
 */

/** @param {number} count */
export function firstPrimes(count) {
  /** @type {number[]} */
  const primes = [];
  for (let n = 2; primes.length < count; n += 1) {
    if (primes.every((p) => p * p > n || n % p !== 0)) primes.push(n);
  }
  return primes;
}

/**
 * floor(value^(1/degree)) for a non-negative BigInt, by Newton's method on integers: exact,
 * with none of the rounding questions a floating-point root would raise.
 * @param {bigint} value
 * @param {bigint} degree
 */
export function integerRoot(value, degree) {
  if (value < 2n) return value;
  let x = 1n << (BigInt(value.toString(2).length) / degree + 1n);
  for (;;) {
    const next = ((degree - 1n) * x + value / x ** (degree - 1n)) / degree;
    if (next >= x) return x;
    x = next;
  }
}

/**
 * The first 32 bits of the fractional part of prime^(1/degree).
 * @param {number} prime
 * @param {bigint} degree
 */
function fractionBits(prime, degree) {
  return Number(integerRoot(BigInt(prime) << (32n * degree), degree) & 0xffffffffn);
}

/** FIPS 180-4 §5.3.3: square roots of the first 8 primes. */
export const H0 = Object.freeze(firstPrimes(8).map((p) => fractionBits(p, 2n)));

/** FIPS 180-4 §4.2.2: cube roots of the first 64 primes. */
export const K = Object.freeze(firstPrimes(64).map((p) => fractionBits(p, 3n)));

/** @param {number} x @param {number} y @param {number} z */
export const ch = (x, y, z) => ((x & y) ^ (~x & z)) >>> 0;
/** @param {number} x @param {number} y @param {number} z */
export const maj = (x, y, z) => ((x & y) ^ (x & z) ^ (y & z)) >>> 0;
/** Σ0 @param {number} x */
export const bigSigma0 = (x) => (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0;
/** Σ1 @param {number} x */
export const bigSigma1 = (x) => (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0;
/** σ0 @param {number} x */
export const smallSigma0 = (x) => (rotr(x, 7) ^ rotr(x, 18) ^ shr(x, 3)) >>> 0;
/** σ1 @param {number} x */
export const smallSigma1 = (x) => (rotr(x, 17) ^ rotr(x, 19) ^ shr(x, 10)) >>> 0;

/**
 * FIPS 180-4 §5.1.1: append 0x80, then zero bytes up to 56 mod 64, then the message length in
 * bits as a 64-bit big-endian number.
 * @param {Uint8Array} message
 */
export function pad(message) {
  const zeroBytes = (55 - (message.length % 64) + 64) % 64;
  const totalBytes = message.length + 1 + zeroBytes + 8;
  const padded = new Uint8Array(totalBytes);
  padded.set(message);
  padded[message.length] = 0x80;
  const messageBits = message.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(totalBytes - 8, Math.floor(messageBits / 2 ** 32));
  view.setUint32(totalBytes - 4, messageBits >>> 0);
  return { padded, padding: { messageBits, zeroBytes, totalBytes } };
}

/**
 * FIPS 180-4 §6.2.2 step 1: W[0..15] is the block, the rest is expanded from it.
 * @param {number[]} words
 */
export function messageSchedule(words) {
  const w = words.slice();
  for (let t = 16; t < 64; t += 1) {
    w.push(add32(smallSigma1(w[t - 2]), w[t - 7], smallSigma0(w[t - 15]), w[t - 16]));
  }
  return w;
}

/**
 * Steps 2 to 4 of §6.2.2: 64 rounds, then the feed-forward into the intermediate hash.
 * @param {readonly number[]} hIn
 * @param {number[]} w
 * @param {boolean} record
 */
function compress(hIn, w, record) {
  let [a, b, c, d, e, f, g, h] = hIn;
  /** @type {RoundTrace[]} */
  const rounds = [];
  for (let t = 0; t < 64; t += 1) {
    const S1 = bigSigma1(e);
    const Ch = ch(e, f, g);
    const T1 = add32(h, S1, Ch, K[t], w[t]);
    const S0 = bigSigma0(a);
    const Maj = maj(a, b, c);
    const T2 = add32(S0, Maj);
    const before = [a, b, c, d, e, f, g, h];
    h = g;
    g = f;
    f = e;
    e = add32(d, T1);
    d = c;
    c = b;
    b = a;
    a = add32(T1, T2);
    if (record) rounds.push({ t, before, after: [a, b, c, d, e, f, g, h], T1, T2, K: K[t], W: w[t], Ch, Maj, S0, S1 });
  }
  const final = [a, b, c, d, e, f, g, h];
  return { H: hIn.map((value, i) => add32(value, final[i])), rounds };
}

/**
 * @param {Uint8Array} message
 * @returns {Uint8Array} 32-byte digest
 */
export function sha256(message) {
  const { padded } = pad(message);
  let H = [...H0];
  for (let offset = 0; offset < padded.length; offset += 64) {
    H = compress(H, messageSchedule(bytesToWords(padded, offset, 16)), false).H;
  }
  return wordsToBytes(H);
}

/**
 * Every intermediate value of the computation, for the step-by-step screen.
 * @param {Uint8Array} message
 * @returns {Sha256Trace}
 */
export function sha256Trace(message) {
  const { padded, padding } = pad(message);
  /** @type {BlockTrace[]} */
  const blocks = [];
  let H = [...H0];
  for (let index = 0; index * 64 < padded.length; index += 1) {
    const words = bytesToWords(padded, index * 64, 16);
    const schedule = messageSchedule(words);
    const result = compress(H, schedule, true);
    blocks.push({ index, words, schedule, rounds: result.rounds, H: result.H });
    H = result.H;
  }
  return { padding, padded, blocks, digest: wordsToBytes(H) };
}

/**
 * Undoes one round from its output and the K, W it used. That a round can be undone is why the
 * feed-forward exists: without it, the whole block could be run backwards from its result.
 * @param {readonly number[]} after registers a..h leaving the round
 * @param {number} k
 * @param {number} w
 * @returns {number[]} registers a..h entering the round
 */
export function invertRound(after, k, w) {
  const [a, b, c, d, e, f, g, h] = after;
  const T2 = add32(bigSigma0(b), maj(b, c, d));
  const T1 = (a - T2) >>> 0;
  const dBefore = (e - T1) >>> 0;
  const hBefore = (T1 - bigSigma1(f) - ch(f, g, h) - k - w) >>> 0;
  return [b, c, d, dBefore, f, g, h, hBefore];
}
