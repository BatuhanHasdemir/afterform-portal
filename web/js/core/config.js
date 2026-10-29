// @ts-check

export const API_BASE = '/api';

export const REQUEST_TIMEOUT_MS = 15000;

/** @type {readonly import('./types.js').Lang[]} */
export const SUPPORTED_LANGS = Object.freeze(['tr', 'en']);

/** @type {import('./types.js').Lang} */
export const DEFAULT_LANG = 'tr';

export const LOGIN_PATH = '/login.html';

/** @type {Readonly<Record<import('./types.js').Role, string>>} */
export const HOME_BY_ROLE = Object.freeze({
  artist: '/portal/demos.html',
  admin: '/admin/',
});

export const PASSWORD_RULES = Object.freeze({ minLength: 12, maxLength: 128 });

// The browser checks these only to answer early; the server checks them again and decides.
// Empty lists or a null size switch that check off. Extensions are written without the dot,
// lower case. "audio/mp3" is not a registered type, but some browsers report MP3 files with it.
export const UPLOAD_RULES = Object.freeze({
  allowedExtensions: /** @type {readonly string[]} */ (['mp3']),
  allowedMimeTypes: /** @type {readonly string[]} */ (['audio/mpeg', 'audio/mp3']),
  // Decimal megabytes, so the limit reads as "100 MB" and not "104.9 MB".
  maxBytes: /** @type {number | null} */ (100_000_000),
});

export const FIELD_LIMITS = Object.freeze({
  displayName: Object.freeze({ min: 2, max: 60 }),
  email: Object.freeze({ min: 1, max: 254 }),
  title: Object.freeze({ min: 1, max: 120 }),
  note: Object.freeze({ min: 0, max: 1000 }),
  statusNote: Object.freeze({ min: 0, max: 500 }),
});

/** @type {readonly import('./types.js').Status[]} */
export const STATUSES = Object.freeze(['pending', 'in_review', 'accepted', 'rejected']);

/** @type {readonly import('./types.js').Genre[]} */
export const GENRES = Object.freeze([
  'electronic',
  'hiphop',
  'pop',
  'rock',
  'ambient',
  'jazz',
  'experimental',
  'other',
]);

/** @type {readonly import('./types.js').SortOrder[]} */
export const SORT_ORDERS = Object.freeze(['newest', 'oldest', 'updated', 'title']);

export const PAGINATION = Object.freeze({ defaultPageSize: 20, maxPageSize: 100 });

export const PBKDF2_PROJECT_ITERATIONS = 220000;

// The step-by-step SHA-256 screen keeps every round of every block; beyond a few blocks there
// is nothing new to see and only more to draw.
export const LAB_TRACE_MAX_BYTES = 1024;

// Web Crypto hashes a file in one piece, so the whole file has to fit in memory. It follows the
// upload limit, which must stay at about 200 MB or below for that reason.
export const VERIFY_MAX_BYTES = UPLOAD_RULES.maxBytes ?? 100_000_000;

export const IS_DEV =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
