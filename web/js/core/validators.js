// @ts-check
import { FIELD_LIMITS, GENRES, PASSWORD_RULES, STATUSES, UPLOAD_RULES } from './config.js';
/** @import { FieldErrorCode } from './types.js' */

/** @typedef {{ name: string, size: number, type: string }} FileLike */
/** @typedef {{ allowedExtensions: readonly string[], allowedMimeTypes: readonly string[], maxBytes: number | null }} UploadRules */

// Each validator returns one of the server's field error codes, or null when the value is fine.
// Lengths are String#length (UTF-16 code units), the unit the .NET backend's length checks use.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Browsers strip tabs and newlines while parsing URLs, so "/\t/evil.example" would become
// "//evil.example"; control characters are rejected outright.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * @param {unknown} value
 * @param {{ min: number, max: number }} limits
 * @param {{ required?: boolean, trim?: boolean }} [options]
 * @returns {FieldErrorCode | null}
 */
export function validateText(value, { min, max }, { required = true, trim = true } = {}) {
  if (value === undefined || value === null) return required ? 'required' : null;
  if (typeof value !== 'string') return 'invalid_value';
  const text = trim ? value.trim() : value;
  if (text === '') return required ? 'required' : null;
  if (text.length < min) return 'too_short';
  if (text.length > max) return 'too_long';
  return null;
}

/** @param {unknown} value */
export function validateDisplayName(value) {
  return validateText(value, FIELD_LIMITS.displayName);
}

/**
 * @param {unknown} value
 * @returns {FieldErrorCode | null}
 */
export function validateEmail(value) {
  const lengthError = validateText(value, FIELD_LIMITS.email);
  if (lengthError) return lengthError;
  return EMAIL_PATTERN.test(String(value).trim()) ? null : 'invalid_format';
}

/** @param {unknown} value */
export function validatePassword(value) {
  return validateText(
    value,
    { min: PASSWORD_RULES.minLength, max: PASSWORD_RULES.maxLength },
    { trim: false },
  );
}

/** @param {unknown} value */
export function validateTitle(value) {
  return validateText(value, FIELD_LIMITS.title);
}

/** @param {unknown} value */
export function validateNote(value) {
  return validateText(value, FIELD_LIMITS.note, { required: false });
}

/** @param {unknown} value */
export function validateStatusNote(value) {
  return validateText(value, FIELD_LIMITS.statusNote, { required: false });
}

/**
 * @param {unknown} value
 * @returns {FieldErrorCode | null}
 */
export function validateGenre(value) {
  return oneOf(value, GENRES);
}

/**
 * @param {unknown} value
 * @returns {FieldErrorCode | null}
 */
export function validateStatus(value) {
  return oneOf(value, STATUSES);
}

/**
 * Empty rule lists and a null size skip the check entirely; the server always decides.
 * @param {FileLike | null | undefined} file
 * @param {UploadRules} [rules]
 * @returns {'required' | 'too_large' | 'unsupported_type' | null}
 */
export function validateFile(file, rules = UPLOAD_RULES) {
  if (!file || file.size === 0) return 'required';
  if (rules.maxBytes !== null && file.size > rules.maxBytes) return 'too_large';
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : '';
  const extensionOk = rules.allowedExtensions.length === 0 || rules.allowedExtensions.includes(extension);
  // An empty type means the browser could not tell; the extension and the server then decide.
  const type = file.type.toLowerCase();
  const typeOk = rules.allowedMimeTypes.length === 0 || type === '' || rules.allowedMimeTypes.includes(type);
  return extensionOk && typeOk ? null : 'unsupported_type';
}

/** @param {string} email */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * Accepts only same-origin relative paths for post-login redirects.
 * @param {unknown} raw value of the `next` query parameter
 * @param {string} fallback
 */
export function safeNextPath(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  // Checked before and after one round of decoding, so "/%2F%2Fevil.example" cannot become
  // "//evil.example" in a layer that decodes the path again.
  return isLocalPath(raw) && isLocalPath(decoded) ? raw : fallback;
}

/** @param {string} value */
function isLocalPath(value) {
  return (
    value.startsWith('/') && !value.includes('//') && !value.includes('\\') && !CONTROL_CHARS.test(value)
  );
}

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @returns {FieldErrorCode | null}
 */
function oneOf(value, allowed) {
  if (value === undefined || value === null || value === '') return 'required';
  return typeof value === 'string' && allowed.includes(value) ? null : 'invalid_value';
}
