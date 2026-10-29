// @ts-check

const HEX_PAIRS = /^(?:[0-9a-f]{2})*$/i;
const encoder = new TextEncoder();

/**
 * @param {string} hex an even number of hex digits, any case
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  if (!HEX_PAIRS.test(hex)) throw new TypeError('Expected an even number of hex digits.');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} lower-case hex
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {number} byte */
export function hex8(byte) {
  return (byte & 0xff).toString(16).padStart(2, '0');
}

/**
 * A 32-bit word as eight hex digits.
 * @param {number} word
 */
export function hex32(word) {
  return (word >>> 0).toString(16).padStart(8, '0');
}

/** @param {number} byte */
export function binary8(byte) {
  return (byte & 0xff).toString(2).padStart(8, '0');
}

/** @param {string} text */
export function utf8Bytes(text) {
  return encoder.encode(text);
}

/**
 * Big-endian 32-bit words, the way SHA-2 reads a block.
 * @param {Uint8Array} bytes
 * @param {number} [offset]
 * @param {number} [count]
 */
export function bytesToWords(bytes, offset = 0, count = (bytes.length - offset) / 4) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: count }, (_, i) => view.getUint32(offset + i * 4));
}

/** @param {readonly number[]} words */
export function wordsToBytes(words) {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  words.forEach((word, i) => view.setUint32(i * 4, word >>> 0));
  return bytes;
}
