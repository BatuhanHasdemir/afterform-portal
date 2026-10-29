// @ts-check
import { getLang } from './i18n.js';

/** @type {Readonly<Record<string, string>>} */
const LOCALES = Object.freeze({ tr: 'tr-TR', en: 'en-GB' });

const BYTE_UNITS = /** @type {const} */ (['byte', 'kilobyte', 'megabyte', 'gigabyte']);

function locale() {
  return LOCALES[getLang()] ?? getLang();
}

/**
 * @param {string} iso ISO-8601 timestamp from the API (UTC)
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatDateTime(iso, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale(), options).format(date);
}

/**
 * @param {number} value
 * @param {Intl.NumberFormatOptions} [options]
 */
export function formatNumber(value, options) {
  return new Intl.NumberFormat(locale(), options).format(value);
}

/**
 * @param {number} ratio 0..1
 * @param {number} [digits] fraction digits
 */
export function formatPercent(ratio, digits = 0) {
  return new Intl.NumberFormat(locale(), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

/**
 * Milliseconds below one second, seconds with two decimals above.
 * @param {number} ms
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return new Intl.NumberFormat(locale(), { style: 'unit', unit: 'millisecond', maximumFractionDigits: 0 }).format(ms);
  }
  return new Intl.NumberFormat(locale(), {
    style: 'unit',
    unit: 'second',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ms / 1000);
}

/**
 * Re-formats [data-datetime] and [data-bytes] elements in the current language, so pages can
 * follow a language change without rebuilding (and, say, restarting an audio player).
 * @param {ParentNode} root
 */
export function localizeFormats(root) {
  for (const el of root.querySelectorAll('[data-datetime]')) {
    const dateOnly = el.getAttribute('data-datetime-style') === 'date';
    el.textContent = formatDateTime(
      el.getAttribute('data-datetime') ?? '',
      dateOnly ? { dateStyle: 'medium' } : undefined,
    );
  }
  for (const el of root.querySelectorAll('[data-bytes]')) {
    el.textContent = formatBytes(Number(el.getAttribute('data-bytes')));
  }
}

/**
 * Decimal (SI) units, matching the unit names Intl prints.
 * @param {number} bytes
 */
export function formatBytes(bytes) {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(locale(), {
    style: 'unit',
    unit: BYTE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}
