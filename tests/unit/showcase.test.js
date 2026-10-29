import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PBKDF2_PROJECT_ITERATIONS } from '../../web/js/core/config.js';
import { ITERATION_STEPS } from '../../web/js/components/iteration-bars.js';
import { waveform } from '../../web/js/components/signal.js';
import en from '../../web/js/i18n/en.js';
import tr from '../../web/js/i18n/tr.js';

const WEB_DIR = fileURLToPath(new URL('../../web/', import.meta.url));
const PHOTOS_DIR = join(WEB_DIR, 'assets/photos');

test('the hero headline’s two lines read as the tagline its fingerprint is taken from', () => {
  for (const { home } of [tr, en]) assert.equal(`${home.taglineStart} ${home.taglineEnd}`, home.tagline);
});

test('every photo is used on one page only, and every photo in the folder is used', () => {
  /** @type {Map<string, Set<string>>} */
  const pagesByPhoto = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (extname(entry.name) === '.html') {
        for (const [, name] of readFileSync(path, 'utf8').matchAll(/\/assets\/photos\/([a-z]+)-/g)) {
          if (!pagesByPhoto.has(name)) pagesByPhoto.set(name, new Set());
          pagesByPhoto.get(name).add(relative(WEB_DIR, path));
        }
      }
    }
  };
  walk(WEB_DIR);
  const shared = [...pagesByPhoto].filter(([, pages]) => pages.size > 1).map(([name, pages]) => `${name}: ${[...pages]}`);
  assert.deepEqual(shared, []);
  const inFolder = new Set(readdirSync(PHOTOS_DIR).filter((file) => /\.(avif|webp)$/.test(file)).map((file) => file.split('-')[0]));
  assert.deepEqual([...inFolder].sort(), [...pagesByPhoto.keys()].sort());
});

test('the hero waveform: 32 bars, every one visible, the same every time', () => {
  const bars = waveform();
  assert.equal(bars.length, 32);
  assert.ok(bars.every((height) => height >= 0.05 && height <= 1), JSON.stringify(bars));
  assert.deepEqual(waveform(), bars);
  // It swells and fades: the ends are lower than the middle.
  const middle = Math.max(...bars.slice(10, 22));
  assert.ok(bars[0] < middle && bars.at(-1) < middle);
});

test('the iteration bars include the project setting, in ascending order', () => {
  assert.ok(ITERATION_STEPS.includes(PBKDF2_PROJECT_ITERATIONS));
  assert.deepEqual([...ITERATION_STEPS].sort((a, b) => a - b), [...ITERATION_STEPS]);
});
