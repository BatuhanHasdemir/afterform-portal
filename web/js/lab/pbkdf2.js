// @ts-check
import { utf8Bytes } from './hex.js';

// The E12 series (1.0, 1.2, 1.5, 1.8, 2.2, 2.7 ... per decade) is evenly spaced on a log scale
// and contains 2.2, so every slider step changes the value by about a fifth and the project's
// 220,000 is one of the stops. Evenly spaced positions rounded to two digits would instead map
// neighbouring positions onto the same number, and an arrow key press would seem to do nothing.
const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
const STOPS = Object.freeze([
  ...[100, 1_000, 10_000].flatMap((scale) => E12.map((mantissa) => mantissa * scale)),
  1_000_000,
]);

export const MIN_ITERATIONS = STOPS[0];
export const MAX_ITERATIONS = STOPS[STOPS.length - 1];
export const SLIDER_STEPS = STOPS.length - 1;
export const SALT_BYTES = 16;
// The same length as the project's stored password hash.
export const OUTPUT_BITS = 256;

/** @param {number} position 0..SLIDER_STEPS */
export function iterationsAt(position) {
  return STOPS[Math.min(Math.max(Math.round(position), 0), SLIDER_STEPS)];
}

/**
 * The slider position whose value is closest to `iterations` on the log scale.
 * @param {number} iterations
 */
export function positionOf(iterations) {
  let best = 0;
  STOPS.forEach((stop, position) => {
    if (Math.abs(Math.log(stop / iterations)) < Math.abs(Math.log(STOPS[best] / iterations))) best = position;
  });
  return best;
}

/** @param {number} [length] */
export function randomSalt(length = SALT_BYTES) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * PBKDF2-HMAC-SHA512 through Web Crypto (RFC 8018 §5.2). deriveBits is asynchronous, so the
 * page keeps responding while even a million iterations run.
 * @param {{ password: string, salt: Uint8Array<ArrayBuffer>, iterations: number, bits?: number }} input
 * @returns {Promise<{ bytes: Uint8Array, ms: number }>} the derived bytes and the measured time
 */
export async function derive({ password, salt, iterations, bits = OUTPUT_BITS }) {
  const key = await crypto.subtle.importKey('raw', utf8Bytes(password), 'PBKDF2', false, ['deriveBits']);
  const started = performance.now();
  const buffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt, iterations }, key, bits);
  return { bytes: new Uint8Array(buffer), ms: performance.now() - started };
}
