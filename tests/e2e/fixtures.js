import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';

export { expect };

const SEED = JSON.parse(readFileSync(new URL('../../dev-mock/seed.json', import.meta.url), 'utf8'));
export const [ARTIST, ARTIST2, ADMIN] = SEED.users;

/**
 * Every test starts from the seed, and fails on an uncaught error, a console error or warning,
 * or a CSP report. Failed requests also reach the console in Chrome; the pages expect some
 * (401 from /api/me for a guest, for example), so only those are let through.
 */
export const test = base.extend({
  page: async ({ page, request }, use) => {
    expect((await request.post('/dev/reset')).status()).toBe(204);
    const problems = [];
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
    page.on('console', (message) => {
      if (!['error', 'warning'].includes(message.type())) return;
      if (message.text().startsWith('Failed to load resource')) return;
      problems.push(`${message.type()}: ${message.text()}`);
    });
    await use(page);
    expect(problems).toEqual([]);
  },
});

/** Signs in through the API; the page's cookies are shared with `page.request`. */
export async function signIn(page, user) {
  const { token } = await (await page.request.get('/api/csrf')).json();
  const res = await page.request.post('/api/auth/login', {
    headers: { 'X-CSRF-TOKEN': token },
    data: { email: user.email, password: user.password },
  });
  expect(res.status()).toBe(200);
}

export async function signOut(page) {
  const { token } = await (await page.request.get('/api/csrf')).json();
  expect((await page.request.post('/api/auth/logout', { headers: { 'X-CSRF-TOKEN': token } })).status()).toBe(204);
}
