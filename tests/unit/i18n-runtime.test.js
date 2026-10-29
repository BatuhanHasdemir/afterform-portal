import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

// i18n.js runs against minimal stand-ins for the browser globals it uses: document,
// Element, navigator and localStorage.

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = '';
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
}

let elements = [];
globalThis.Element = FakeElement;
globalThis.document = {
  documentElement: { lang: '' },
  querySelectorAll: (selector) => {
    const attr = selector.slice(1, -1);
    return elements.filter((el) => el.hasAttribute(attr));
  },
};

let stored = new Map();
let storageBroken = false;
globalThis.localStorage = {
  getItem: (key) => {
    if (storageBroken) throw new Error('storage disabled');
    return stored.get(key) ?? null;
  },
  setItem: (key, value) => {
    if (storageBroken) throw new Error('storage disabled');
    stored.set(key, String(value));
  },
};

function setBrowserLanguage(language) {
  Object.defineProperty(globalThis, 'navigator', { value: { language }, configurable: true });
}

const i18n = await import('../../web/js/core/i18n.js');

beforeEach(() => {
  elements = [];
  stored = new Map();
  storageBroken = false;
  setBrowserLanguage('tr-TR');
});

describe('detectLang', () => {
  test('uses a browser language starting with "en", Turkish otherwise', () => {
    setBrowserLanguage('en-US');
    assert.equal(i18n.detectLang(), 'en');
    setBrowserLanguage('de-DE');
    assert.equal(i18n.detectLang(), 'tr');
    setBrowserLanguage('tr-TR');
    assert.equal(i18n.detectLang(), 'tr');
  });

  test('a saved choice wins over the browser language; unknown values are ignored', () => {
    setBrowserLanguage('tr-TR');
    stored.set('lang', 'en');
    assert.equal(i18n.detectLang(), 'en');
    stored.set('lang', 'fr');
    assert.equal(i18n.detectLang(), 'tr');
  });

  test('blocked storage falls back to the browser language', () => {
    storageBroken = true;
    setBrowserLanguage('en-GB');
    assert.equal(i18n.detectLang(), 'en');
  });
});

describe('switching language', () => {
  test('updates texts, attributes and <html lang> in place and remembers the choice', async () => {
    setBrowserLanguage('en-GB');
    const heading = new FakeElement({ 'data-i18n': 'nav.login' });
    const field = new FakeElement({ 'data-i18n-attr': 'aria-label:nav.main; title:nav.language' });
    elements = [heading, field];

    await i18n.initI18n();
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(heading.textContent, 'Sign in');
    assert.equal(field.getAttribute('aria-label'), 'Main menu');

    const heard = [];
    const stop = i18n.onLangChange((lang) => heard.push(lang));
    await i18n.setLang('tr');
    stop();

    assert.equal(document.documentElement.lang, 'tr');
    assert.equal(heading.textContent, 'Giriş yap');
    assert.equal(field.getAttribute('aria-label'), 'Ana menü');
    assert.equal(field.getAttribute('title'), 'Dil');
    assert.equal(stored.get('lang'), 'tr');
    assert.deepEqual(heard, ['tr']);
    assert.equal(i18n.detectLang(), 'tr', 'the saved choice is used on the next page load');
  });

  test('an unsupported language is ignored', async () => {
    await i18n.setLang('tr');
    await i18n.setLang('xx');
    assert.equal(i18n.getLang(), 'tr');
    assert.equal(stored.get('lang'), 'tr');
  });

  test('still switches when storage is unavailable', async () => {
    await i18n.setLang('tr');
    storageBroken = true;
    await i18n.setLang('en');
    assert.equal(i18n.getLang(), 'en');
    assert.equal(document.documentElement.lang, 'en');
  });

  test('stored placeholder values follow a language change', async () => {
    const pager = new FakeElement({ 'data-i18n': 'common.pager.status', 'data-i18n-params': '{"page":2,"pages":5}' });
    const broken = new FakeElement({ 'data-i18n': 'common.pager.status', 'data-i18n-params': '{not json' });
    elements = [pager, broken];
    await i18n.setLang('en');
    assert.equal(pager.textContent, 'Page 2 of 5');
    assert.equal(broken.textContent, 'Page {page} of {pages}');
    await i18n.setLang('tr');
    assert.equal(pager.textContent, 'Sayfa 2 / 5');
  });

  test('event handler attributes are never written from translations', async () => {
    const el = new FakeElement({ 'data-i18n-attr': 'onclick:nav.login;title:nav.login' });
    elements = [el];
    await i18n.setLang('en');
    assert.equal(el.getAttribute('onclick'), null);
    assert.equal(el.getAttribute('title'), 'Sign in');
  });
});

describe('t', () => {
  test('fills placeholders and picks the plural form from count', async () => {
    await i18n.setLang('en');
    assert.equal(
      i18n.t('errors.auth.too_many_attempts', { count: 1 }),
      'Too many failed sign-in attempts. Try again in 1 minute.',
    );
    assert.equal(
      i18n.t('errors.auth.too_many_attempts', { count: 15 }),
      'Too many failed sign-in attempts. Try again in 15 minutes.',
    );
    assert.equal(i18n.t('errors.field.too_short', { min: 12 }), 'Must be at least 12 characters.');

    await i18n.setLang('tr');
    assert.equal(
      i18n.t('errors.auth.too_many_attempts', { count: 15 }),
      'Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar dene.',
    );
  });

  test('a missing key comes back as the key itself', () => {
    assert.equal(i18n.t('nav.doesNotExist'), 'nav.doesNotExist');
    assert.equal(i18n.t('nav'), 'nav');
  });
});
