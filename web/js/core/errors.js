// @ts-check
/** @import { FieldErrorCode } from './types.js' */

export const NETWORK_ERROR = 'network.error';
export const SERVER_ERROR = 'server.error';

// Only codes the UI has text for are kept; anything else becomes a generic failure, so an
// unexpected server value can never reach the screen.
const KNOWN_CODES = new Set([
  'validation.failed',
  'csrf.invalid',
  'auth.unauthenticated',
  'auth.invalid_credentials',
  'auth.too_many_attempts',
  'auth.forbidden',
  'auth.email_taken',
  'auth.reset_token_invalid',
  'demo.not_found',
  'upload.too_large',
  'upload.unsupported_type',
  'rate.limited',
  'not_found',
  SERVER_ERROR,
  NETWORK_ERROR,
]);

/** @type {ReadonlySet<string>} */
const FIELD_CODES = new Set(['required', 'too_short', 'too_long', 'invalid_format', 'invalid_value']);

/** @type {Readonly<Record<number, string>>} */
const CODE_BY_STATUS = Object.freeze({
  401: 'auth.unauthenticated',
  403: 'auth.forbidden',
  404: 'not_found',
  413: 'upload.too_large',
  415: 'upload.unsupported_type',
  429: 'rate.limited',
});

export class ApiError extends Error {
  /**
   * @param {{ status: number, code: string, fields?: Record<string, FieldErrorCode[]>, retryAfterSeconds?: number | null }} init
   */
  constructor({ status, code, fields = {}, retryAfterSeconds = null }) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * @param {number} status
 * @param {unknown} body parsed JSON body, or null when there was none
 * @param {string | null} retryAfterHeader
 */
export function apiErrorFrom(status, body, retryAfterHeader) {
  const data = isRecord(body) ? body : {};
  const code =
    typeof data.code === 'string' && KNOWN_CODES.has(data.code)
      ? data.code
      : (CODE_BY_STATUS[status] ?? SERVER_ERROR);
  return new ApiError({
    status,
    code,
    fields: readFields(data.fields),
    retryAfterSeconds: readRetryAfter(data.retryAfterSeconds, retryAfterHeader),
  });
}

/** @param {unknown} error */
export function toApiError(error) {
  if (error instanceof ApiError) return error;
  return new ApiError({ status: 0, code: SERVER_ERROR });
}

/** @param {string} code */
export function errorKey(code) {
  return `errors.${KNOWN_CODES.has(code) ? code : SERVER_ERROR}`;
}

/** @param {FieldErrorCode} code */
export function fieldErrorKey(code) {
  return `errors.field.${code}`;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, FieldErrorCode[]>}
 */
function readFields(value) {
  /** @type {Record<string, FieldErrorCode[]>} */
  const fields = {};
  if (!isRecord(value)) return fields;
  for (const [name, codes] of Object.entries(value)) {
    if (!Array.isArray(codes)) continue;
    const known = /** @type {FieldErrorCode[]} */ (codes.filter((c) => FIELD_CODES.has(c)));
    if (known.length > 0) fields[name] = known;
  }
  return fields;
}

/**
 * @param {unknown} fromBody
 * @param {string | null} header
 * @returns {number | null}
 */
function readRetryAfter(fromBody, header) {
  if (typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody >= 0) {
    return Math.ceil(fromBody);
  }
  if (!header) return null;
  if (/^\d+$/.test(header.trim())) return Number(header.trim());
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}
