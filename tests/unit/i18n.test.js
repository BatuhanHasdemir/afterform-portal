import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { GENRES, STATUSES } from '../../web/js/core/config.js';
import { errorKey, fieldErrorKey } from '../../web/js/core/errors.js';
import { parseAttrMap } from '../../web/js/core/i18n.js';
import en from '../../web/js/i18n/en.js';
import tr from '../../web/js/i18n/tr.js';

const WEB_DIR = fileURLToPath(new URL('../../web/', import.meta.url));
const DICTIONARIES = { tr, en };

const NAMESPACES = [
  'common', 'nav', 'home', 'auth', 'demos', 'upload', 'admin', 'security', 'lab', 'status', 'genre', 'errors',
];
const KEY_LITERAL = new RegExp(`['"\`]((?:${NAMESPACES.join('|')})\\.[A-Za-z0-9_.]+)['"\`]`, 'g');

const ERROR_CODES = [
  'validation.failed', 'csrf.invalid', 'auth.unauthenticated', 'auth.invalid_credentials',
  'auth.too_many_attempts', 'auth.forbidden', 'auth.email_taken', 'auth.reset_token_invalid',
  'demo.not_found', 'upload.too_large', 'upload.unsupported_type', 'rate.limited', 'not_found',
  'server.error', 'network.error',
];
const FIELD_CODES = ['required', 'too_short', 'too_long', 'invalid_format', 'invalid_value'];

function leaves(node, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) leaves(value, path, out);
    else out.set(path, value);
  }
  return out;
}

// A key resolves to a string, or to plural forms (an object with at least `other`).
function resolves(dictionary, key) {
  let node = dictionary;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) return false;
    node = node[part];
  }
  return typeof node === 'string' || (typeof node === 'object' && typeof node?.other === 'string');
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function assertKnown(keys, source) {
  for (const [lang, dictionary] of Object.entries(DICTIONARIES)) {
    const missing = [...keys].filter((key) => !resolves(dictionary, key));
    assert.deepEqual(missing, [], `${source}: keys missing in ${lang}`);
  }
}

test('TR and EN define exactly the same keys', () => {
  assert.deepEqual([...leaves(tr).keys()].sort(), [...leaves(en).keys()].sort());
});

test('no translation is empty and every value is a string', () => {
  for (const [lang, dictionary] of Object.entries(DICTIONARIES)) {
    for (const [key, value] of leaves(dictionary)) {
      assert.equal(typeof value, 'string', `${lang}:${key}`);
      assert.notEqual(value.trim(), '', `${lang}:${key}`);
    }
  }
});

test('TR and EN use the same placeholders for each key', () => {
  const enLeaves = leaves(en);
  for (const [key, value] of leaves(tr)) {
    const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(names(value), names(enLeaves.get(key)), key);
  }
});

test('only the documented top-level namespaces are used', () => {
  for (const dictionary of Object.values(DICTIONARIES)) {
    for (const key of Object.keys(dictionary)) assert.ok(NAMESPACES.includes(key), key);
  }
});

test('every data-i18n and data-i18n-attr key in the HTML exists', () => {
  for (const path of walk(WEB_DIR)) {
    if (extname(path) !== '.html') continue;
    const html = readFileSync(path, 'utf8');
    const keys = new Set([...html.matchAll(/\sdata-i18n="([^"]+)"/g)].map((m) => m[1]));
    for (const [, spec] of html.matchAll(/\sdata-i18n-attr="([^"]+)"/g)) {
      for (const [, key] of parseAttrMap(spec)) keys.add(key);
    }
    assertKnown(keys, relative(WEB_DIR, path));
  }
});

test('every literal translation key in the scripts exists', () => {
  for (const path of walk(join(WEB_DIR, 'js'))) {
    if (extname(path) !== '.js' || path.includes(`${join('js', 'i18n')}`)) continue;
    const source = readFileSync(path, 'utf8');
    // API error codes share prefixes with namespaces ('auth.', 'upload.'); they are codes, not keys.
    const keys = new Set(
      [...source.matchAll(KEY_LITERAL)].map((m) => m[1]).filter((value) => !ERROR_CODES.includes(value)),
    );
    assertKnown(keys, relative(WEB_DIR, path));
  }
});

test('every API error code, field code, status and genre has text', () => {
  const keys = new Set([
    ...ERROR_CODES.map(errorKey),
    ...FIELD_CODES.map(fieldErrorKey),
    ...STATUSES.map((status) => `status.${status}`),
    ...GENRES.map((genre) => `genre.${genre}`),
  ]);
  assertKnown(keys, 'contract');
  assert.equal(errorKey('something.unexpected'), 'errors.server.error');
});

test('the lock-out message never mentions an account or a lock', () => {
  const forms = [tr, en].flatMap((d) => Object.values(d.errors.auth.too_many_attempts));
  for (const text of forms) assert.doesNotMatch(text, /hesap|kilit|account|lock/i);
});
