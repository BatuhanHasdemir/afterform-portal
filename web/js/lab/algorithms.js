// @ts-check

/**
 * @typedef {object} Algorithm
 * @property {string} id
 * @property {string} name
 * @property {number} digestBits
 * @property {number | null} blockBits null for the sponge construction
 * @property {{ rate: number, capacity: number } | null} sponge
 * @property {'merkle-damgard' | 'sponge'} structure
 * @property {number} rounds
 * @property {'steps' | 'rounds'} roundUnit
 * @property {'broken' | 'deprecated' | 'secure'} status
 * @property {AlgorithmIdentifier | null} webCrypto name for crypto.subtle.digest, null when the browser has none
 */

/** @type {readonly Algorithm[]} */
export const ALGORITHMS = Object.freeze([
  { id: 'md5', name: 'MD5', digestBits: 128, blockBits: 512, sponge: null, structure: 'merkle-damgard', rounds: 64, roundUnit: 'steps', status: 'broken', webCrypto: null },
  { id: 'sha1', name: 'SHA-1', digestBits: 160, blockBits: 512, sponge: null, structure: 'merkle-damgard', rounds: 80, roundUnit: 'steps', status: 'deprecated', webCrypto: 'SHA-1' },
  { id: 'sha256', name: 'SHA-256', digestBits: 256, blockBits: 512, sponge: null, structure: 'merkle-damgard', rounds: 64, roundUnit: 'rounds', status: 'secure', webCrypto: 'SHA-256' },
  { id: 'sha384', name: 'SHA-384', digestBits: 384, blockBits: 1024, sponge: null, structure: 'merkle-damgard', rounds: 80, roundUnit: 'rounds', status: 'secure', webCrypto: 'SHA-384' },
  { id: 'sha512', name: 'SHA-512', digestBits: 512, blockBits: 1024, sponge: null, structure: 'merkle-damgard', rounds: 80, roundUnit: 'rounds', status: 'secure', webCrypto: 'SHA-512' },
  { id: 'sha3-256', name: 'SHA3-256', digestBits: 256, blockBits: null, sponge: { rate: 1088, capacity: 512 }, structure: 'sponge', rounds: 24, roundUnit: 'rounds', status: 'secure', webCrypto: null },
]);

/** @param {string} id */
export function algorithmById(id) {
  return ALGORITHMS.find((algorithm) => algorithm.id === id) ?? null;
}

/** The algorithms the browser itself can compute. */
export function webCryptoAlgorithms() {
  return ALGORITHMS.filter((algorithm) => algorithm.webCrypto !== null);
}
