import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';

// The theme code touches only <html data-theme>, localStorage and matchMedia; those are stood in
// for here, so the tests run without a browser.

function stubs(stored = {}) {
  const items = new Map(Object.entries(stored));
  return {
    documentElement: { dataset: {} },
    localStorage: {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
      items,
    },
  };
}

describe('theme-boot.js, before the first paint', () => {
  const source = readFileSync(new URL('../../web/js/theme-boot.js', import.meta.url), 'utf8');
  const run = (localStorage) => {
    const document = { documentElement: { dataset: {} } };
    runInNewContext(source, { document, localStorage });
    return document.documentElement.dataset.theme;
  };

  test('applies a stored light or dark choice', () => {
    assert.equal(run(stubs({ theme: 'light' }).localStorage), 'light');
    assert.equal(run(stubs({ theme: 'dark' }).localStorage), 'dark');
  });

  test('leaves the system theme alone for no choice or an unknown value', () => {
    assert.equal(run(stubs().localStorage), undefined);
    assert.equal(run(stubs({ theme: 'sepia' }).localStorage), undefined);
  });

  test('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('SecurityError'); } };
    assert.equal(run(blocked), undefined);
  });
});

describe('theme choice', () => {
  // One stand-in for the system setting across tests: the module starts listening to it once.
  const system = { dark: false, listeners: [] };
  const matchMedia = (query) => ({
    matches: query === '(prefers-color-scheme: dark)' ? system.dark : false,
    addEventListener: (type, listener) => system.listeners.push(listener),
  });
  const systemChanges = (dark) => {
    system.dark = dark;
    for (const listener of system.listeners) listener();
  };

  let env;
  let theme;

  beforeEach(async () => {
    env = stubs();
    system.dark = false;
    globalThis.document = { documentElement: env.documentElement };
    globalThis.localStorage = env.localStorage;
    globalThis.matchMedia = matchMedia;
    theme = await import('../../web/js/core/theme.js');
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.matchMedia;
  });

  test('two themes, light and dark', () => {
    assert.deepEqual(theme.THEMES, ['light', 'dark']);
  });

  test('until something is chosen, the theme in use is the system one', () => {
    assert.equal(theme.getTheme(), 'light');
    system.dark = true;
    assert.equal(theme.getTheme(), 'dark');
  });

  test('a choice is applied, remembered and announced, and wins over the system', () => {
    const heard = [];
    const stop = theme.onThemeChange((current) => heard.push(current));

    theme.setTheme('dark');
    assert.equal(env.documentElement.dataset.theme, 'dark');
    assert.equal(env.localStorage.items.get('theme'), 'dark');
    assert.equal(theme.getTheme(), 'dark');

    systemChanges(false);
    assert.equal(theme.getTheme(), 'dark');

    stop();
    theme.setTheme('light');
    assert.deepEqual(heard, ['dark']);
  });

  test('with nothing chosen, a change of the system theme is announced', () => {
    const heard = [];
    const stop = theme.onThemeChange((current) => heard.push(current));
    systemChanges(true);
    stop();
    assert.deepEqual(heard, ['dark']);
  });

  test('with storage blocked the choice still applies to the page', () => {
    globalThis.localStorage = { setItem: () => { throw new Error('QuotaExceededError'); } };
    theme.setTheme('light');
    assert.equal(env.documentElement.dataset.theme, 'light');
  });
});
