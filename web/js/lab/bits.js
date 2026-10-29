// @ts-check

/**
 * 32-bit right rotation (ROTR^n in FIPS 180-4).
 * @param {number} x
 * @param {number} n 0..31
 */
export function rotr(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/**
 * 32-bit left rotation (ROTL^n in FIPS 180-4, "<<<" in RFC 1321).
 * @param {number} x
 * @param {number} n 0..31
 */
export function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/**
 * 32-bit right shift (SHR^n in FIPS 180-4).
 * @param {number} x
 * @param {number} n
 */
export function shr(x, n) {
  return x >>> n;
}

/**
 * Sum modulo 2^32.
 * @param {...number} values
 */
export function add32(...values) {
  let sum = 0;
  for (const value of values) sum = (sum + value) >>> 0;
  return sum;
}

/** @param {number} byte */
export function popcount8(byte) {
  let count = 0;
  for (let v = byte & 0xff; v; v &= v - 1) count += 1;
  return count;
}

/**
 * Bit `index` of a byte array, counted from the most significant bit of byte 0: the order in
 * which SHA reads a message as a bit string.
 * @param {Uint8Array} bytes
 * @param {number} index
 */
export function bitAt(bytes, index) {
  return (bytes[index >> 3] >> (7 - (index & 7))) & 1;
}

/**
 * A copy of `bytes` with one bit inverted.
 * @param {Uint8Array} bytes
 * @param {number} index same numbering as bitAt
 */
export function flipBit(bytes, index) {
  if (!Number.isInteger(index) || index < 0 || index >= bytes.length * 8) {
    throw new RangeError('Bit index outside the input.');
  }
  const copy = bytes.slice();
  copy[index >> 3] ^= 0x80 >> (index & 7);
  return copy;
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b same length as a
 * @returns {{ xor: Uint8Array, changed: number }} the XOR and how many bits differ
 */
export function diffBits(a, b) {
  if (a.length !== b.length) throw new RangeError('Inputs differ in length.');
  const xor = new Uint8Array(a.length);
  let changed = 0;
  for (let i = 0; i < a.length; i += 1) {
    xor[i] = a[i] ^ b[i];
    changed += popcount8(xor[i]);
  }
  return { xor, changed };
}
