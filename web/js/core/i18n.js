// @ts-check
import { DEFAULT_LANG, IS_DEV, SUPPORTED_LANGS } from './config.js';
/** @import { Lang } from './types.js' */

const STORAGE_KEY = 'lang';

// Static import() targets keep the dictionaries visible to the type checker.
/** @type {Record<Lang, () => Promise<{ default: Record<string, unknown> }>>} */
const loaders = {
  tr: () => import('../i18n/tr.js'),
  en: () => import('../i18n/en.js'),
};

/** @type {Lang} */
let current = DEFAULT_LANG;
/** @type {Record<string, unknown>} */
let dictionary = {};
/** @type {Set<(lang: Lang) => void>} */
const listeners = new Set();

/**
 * @param {unknown} value
 * @returns {value is Lang}
 */
export function isSupportedLang(value) {
  return typeof value === 'string' && SUPPORTED_LANGS.includes(/** @type {Lang} */ (value));
}

/** Saved choice, then a browser language starting with "en", otherwise Turkish. */
export function detectLang() {
  const saved = readSavedLang();
  if (saved) return saved;
  const browser = typeof navigator === 'undefined' ? '' : navigator.language || '';
  return browser.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LANG;
}

export async function initI18n() {
  await load(detectLang());
  applyTranslations(document);
}

/** @param {Lang} lang */
export async function setLang(lang) {
  if (!isSupportedLang(lang)) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); the choice then lasts for this page.
  }
  await load(lang);
  applyTranslations(document);
  for (const listener of listeners) listener(lang);
}

export function getLang() {
  return current;
}

/**
 * @param {(lang: Lang) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onLangChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {string} key dotted path, e.g. 'errors.auth.invalid_credentials'
 * @param {Record<string, string | number>} [params] `{name}` placeholders; `count` also selects a plural form
 */
export function t(key, params) {
  const value = lookup(dictionary, key);
  if (typeof value === 'string') return interpolate(value, params);
  if (isPluralForms(value) && params && typeof params.count === 'number') {
    const category = new Intl.PluralRules(current).select(params.count);
    return interpolate(value[category] ?? value.other, params);
  }
  if (IS_DEV) console.warn('Missing translation key:', key);
  return key;
}

/**
 * Fills `data-i18n` (text) and `data-i18n-attr="attr:key;attr:key"` elements under `root`.
 * @param {ParentNode} root
 */
export function applyTranslations(root) {
  /** @type {Element[]} */
  const textTargets = [...root.querySelectorAll('[data-i18n]')];
  /** @type {Element[]} */
  const attrTargets = [...root.querySelectorAll('[data-i18n-attr]')];
  if (root instanceof Element) {
    if (root.hasAttribute('data-i18n')) textTargets.push(root);
    if (root.hasAttribute('data-i18n-attr')) attrTargets.push(root);
  }
  for (const el of textTargets) {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key, readParams(el));
  }
  for (const el of attrTargets) {
    for (const [attr, key] of parseAttrMap(el.getAttribute('data-i18n-attr') ?? '')) {
      el.setAttribute(attr, t(key));
    }
  }
}

/**
 * @param {string} spec
 * @returns {Array<[string, string]>}
 */
export function parseAttrMap(spec) {
  /** @type {Array<[string, string]>} */
  const pairs = [];
  for (const part of spec.split(';')) {
    const [attr, key] = part.split(':').map((s) => s.trim());
    // Event handler attributes are never set from text, whatever the markup says.
    if (attr && key && !/^on/i.test(attr)) pairs.push([attr, key]);
  }
  return pairs;
}

/**
 * Placeholder values stored with the element (data-i18n-params, JSON), so texts such as
 * "Page 2 of 5" follow a language change without being rebuilt.
 * @param {Element} el
 * @returns {Record<string, string | number> | undefined}
 */
function readParams(el) {
  const raw = el.getAttribute('data-i18n-params');
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** @param {Lang} lang */
async function load(lang) {
  const module = await loaders[lang]();
  dictionary = module.default;
  current = lang;
  document.documentElement.lang = lang;
}

/** @returns {Lang | null} */
function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isSupportedLang(saved) ? saved : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @returns {unknown}
 */
function lookup(source, key) {
  /** @type {unknown} */
  let node = source;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) return undefined;
    node = /** @type {Record<string, unknown>} */ (node)[part];
  }
  return node;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, string> & { other: string }}
 */
function isPluralForms(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (/** @type {Record<string, unknown>} */ (value).other) === 'string'
  );
}

/**
 * @param {string} template
 * @param {Record<string, string | number>} [params]
 */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}
