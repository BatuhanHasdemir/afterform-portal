// @ts-check
import { VERIFY_MAX_BYTES } from './config.js';

/**
 * Web Crypto hashes a buffer in one piece and has no streaming interface, so the whole file
 * has to be read into memory; larger files are not hashed in the browser at all.
 * @param {{ size: number }} file
 */
export function canHashInBrowser(file) {
  return file.size <= VERIFY_MAX_BYTES && Boolean(globalThis.crypto?.subtle);
}

/**
 * The SHA-256 of a local file, computed on this device: the file is not sent anywhere.
 * @param {Blob} file
 * @returns {Promise<string>} 64 lower-case hex digits, the form the API uses
 */
export async function sha256OfFile(file) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Digests typed elsewhere, e.g. copied from Get-FileHash, may be upper case.
 * @param {string} a
 * @param {string} b
 */
export function sameDigest(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
