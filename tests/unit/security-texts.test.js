import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import en from '../../web/js/i18n/en.js';
import tr from '../../web/js/i18n/tr.js';

// ARCHITECTURE Ek A: the Turkish card texts are fixed and must appear word for word.

const doc = readFileSync(new URL('../../docs/ARCHITECTURE.md', import.meta.url), 'utf8');
const appendix = doc.slice(doc.indexOf('## Ek A.'));
const cards = [...appendix.matchAll(/^\*\*(.+?)\*\*\r?\n(.+)$/gm)].map((match) => ({
  title: match[1].trim(),
  body: match[2].trim(),
}));
const IDS = ['sha256', 'pbkdf2', 'salt', 'iterations'];

test('Ek A lists the four cards in a known order', () => {
  assert.deepEqual(
    cards.map((card) => card.title),
    ['SHA-256', 'PBKDF2-HMAC-SHA512', 'Tuzlama (salt)', 'İterasyon maliyeti'],
  );
});

test('Turkish titles and texts are exactly those of Ek A', () => {
  IDS.forEach((id, index) => {
    assert.equal(tr.security.cards[id].title, cards[index].title, `${id} title`);
    assert.equal(tr.security.cards[id].body, cards[index].body, `${id} body`);
  });
});

test('English cards are translations, not copies', () => {
  for (const id of IDS) {
    assert.notEqual(en.security.cards[id].body, tr.security.cards[id].body, id);
  }
});

test('security.html shows the four cards, with the Ek A text even before scripts run', () => {
  const html = readFileSync(new URL('../../web/security.html', import.meta.url), 'utf8');
  IDS.forEach((id, index) => {
    for (const [part, expected] of [['title', cards[index].title], ['body', cards[index].body]]) {
      const pattern = new RegExp(`data-i18n="security\\.cards\\.${id}\\.${part}">([^<]*)<`);
      const match = html.match(pattern);
      assert.ok(match, `${id}.${part} is on the page`);
      assert.equal(match[1], expected, `${id}.${part} fallback text`);
    }
  });
  for (const href of ['/lab/sha256.html', '/lab/pbkdf2.html', '/lab/pbkdf2.html#salt', '/lab/pbkdf2.html#cost', '/lab/compare.html']) {
    assert.ok(html.includes(`href="${href}"`), `links to ${href}`);
  }
});
