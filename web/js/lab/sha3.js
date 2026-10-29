// @ts-check

// SHA3-256 as written in FIPS 202. Web Crypto has no SHA-3, so this module is checked against
// Node crypto. Lanes are BigInt for readability, not for speed.

const MASK = (1n << 64n) - 1n;

/** SHA3-256: rate 1088 bits, capacity 512 bits, 256 bits of output. */
export const RATE_BYTES = 136;
const DIGEST_BYTES = 32;

/**
 * FIPS 202 §3.2.2: ρ offsets, from walking (x, y) → (y, 2x + 3y) mod 5 for t = 0..23. Indexed
 * by x + 5y; the lane at (0, 0) is not rotated.
 */
export const RHO_OFFSETS = Object.freeze(
  (() => {
    const offsets = new Array(25).fill(0);
    let [x, y] = [1, 0];
    for (let t = 0; t < 24; t += 1) {
      offsets[x + 5 * y] = (((t + 1) * (t + 2)) / 2) % 64;
      [x, y] = [y, (2 * x + 3 * y) % 5];
    }
    return offsets;
  })(),
);

/**
 * FIPS 202 §3.2.5, Algorithm 5: one output bit of the degree-8 LFSR whose feedback taps are
 * bits 0, 4, 5 and 6 (x^8 + x^6 + x^5 + x^4 + 1).
 * @param {number} t
 */
function rc(t) {
  let r = 1;
  for (let i = 0; i < t % 255; i += 1) {
    r <<= 1;
    if (r & 0x100) r ^= 0x171;
  }
  return r & 1;
}

/** FIPS 202 §3.2.5, Algorithm 6: ι's constant for each of the 24 rounds. */
export const ROUND_CONSTANTS = Object.freeze(
  Array.from({ length: 24 }, (_, round) => {
    let constant = 0n;
    for (let j = 0; j <= 6; j += 1) {
      if (rc(j + 7 * round)) constant |= 1n << BigInt(2 ** j - 1);
    }
    return constant;
  }),
);

/**
 * @param {bigint} lane
 * @param {number} n
 */
function rot64(lane, n) {
  if (n === 0) return lane;
  return ((lane << BigInt(n)) | (lane >> BigInt(64 - n))) & MASK;
}

/**
 * Keccak-f[1600]: 24 rounds of θ, ρ, π, χ and ι over 25 lanes of 64 bits, indexed by x + 5y.
 * Changes `state` in place.
 * @param {bigint[]} state
 */
export function keccakF1600(state) {
  for (let round = 0; round < 24; round += 1) {
    // θ: every bit takes in the parities of two neighbouring columns.
    const C = [0, 1, 2, 3, 4].map((x) => state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]);
    for (let x = 0; x < 5; x += 1) {
      const D = C[(x + 4) % 5] ^ rot64(C[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] ^= D;
    }
    // ρ and π: rotate each lane, then move it: A'[x, y] = A[(x + 3y) mod 5, x].
    /** @type {bigint[]} */
    const moved = new Array(25);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const from = ((x + 3 * y) % 5) + 5 * x;
        moved[x + 5 * y] = rot64(state[from], RHO_OFFSETS[from]);
      }
    }
    // χ: the only non-linear step, row by row.
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] = moved[x + 5 * y] ^ (~moved[((x + 1) % 5) + 5 * y] & MASK & moved[((x + 2) % 5) + 5 * y]);
      }
    }
    // ι: breaks the symmetry between rounds.
    state[0] ^= ROUND_CONSTANTS[round];
  }
}

/**
 * FIPS 202 §5.1 and §6.1: the SHA-3 domain bits 01, then pad10*1, so the first padding byte
 * carries 0x06 and the last 0x80 (0x86 when they are the same byte).
 * @param {Uint8Array} message
 */
export function pad(message) {
  const padded = new Uint8Array(message.length + RATE_BYTES - (message.length % RATE_BYTES));
  padded.set(message);
  padded[message.length] ^= 0x06;
  padded[padded.length - 1] ^= 0x80;
  return padded;
}

/**
 * The sponge: absorb each rate-sized block into the first lanes and permute; the output is read
 * from the rate part, which for SHA3-256 holds the whole digest at once.
 * @param {Uint8Array} message
 * @returns {Uint8Array} 32 bytes
 */
export function sha3_256(message) {
  const padded = pad(message);
  const view = new DataView(padded.buffer);
  /** @type {bigint[]} */
  const state = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let i = 0; i < RATE_BYTES / 8; i += 1) state[i] ^= view.getBigUint64(offset + i * 8, true);
    keccakF1600(state);
  }
  const digest = new Uint8Array(DIGEST_BYTES);
  const out = new DataView(digest.buffer);
  for (let i = 0; i < DIGEST_BYTES / 8; i += 1) out.setBigUint64(i * 8, state[i], true);
  return digest;
}
