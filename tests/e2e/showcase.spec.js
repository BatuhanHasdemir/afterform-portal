import { createHash } from 'node:crypto';
import { expect, test } from './fixtures.js';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = 'rgb(243, 243, 241)';
const DARK = 'rgb(12, 12, 13)';

test.describe('with a light system theme', () => {
  test.use({ colorScheme: 'light' });

  test('the page follows the system until a theme is chosen, and the choice survives a reload', async ({ page }) => {
    await page.goto('/');
    expect(await background(page)).toBe(LIGHT);
    await expect(page.getByRole('button', { name: 'Açık tema' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Koyu tema' })).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Koyu tema' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => background(page)).toBe(DARK);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await background(page)).toBe(DARK);
    await expect(page.getByRole('button', { name: 'Koyu tema' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Açık tema' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => background(page)).toBe(LIGHT);
  });
});

test('the hero fingerprint is the SHA-256 of the headline and follows the language', async ({ page }) => {
  await page.goto('/');
  const digest = page.locator('[data-signal-digest]');
  await expect(digest).toHaveText(sha256('Biçimden sonra gelen ses.'));
  await expect(page.locator('[data-signal]')).toHaveAttribute('data-state', 'print');

  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(digest).toHaveText(sha256('Sound that comes after form.'));
});

test('the hero photos are served by the portal itself and stay out of the accessibility tree', async ({ page }) => {
  const origins = new Set();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('/');
  const photos = page.locator('.hero__img');
  await expect(photos).toHaveCount(4);
  await expect(page.locator('[data-hero-media]')).toHaveAttribute('aria-hidden', 'true');
  const own = new URL(page.url()).origin;
  for (const photo of await photos.all()) {
    await expect(photo).toHaveAttribute('alt', '');
    await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(new URL(await photo.evaluate((img) => img.currentSrc)).origin).toBe(own);
  }
  expect([...origins]).toEqual([own]);
});

test('the hero photos take turns until the pause button stops them', async ({ page }) => {
  await page.goto('/');
  const pause = page.getByRole('button', { name: 'Fotoğrafları durdur' });
  await expect(pause).toBeVisible();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  const active = () => page.evaluate(() => [...document.querySelectorAll('[data-slide]')].findIndex((el) => el.getAttribute('data-state') === 'active'));
  expect(await active()).toBe(0);

  // The show is timed by a CSS animation, which a fake clock does not drive; a short photo
  // length keeps the test quick.
  await page.locator('[data-hero]').evaluate((hero) => hero.style.setProperty('--slide-ms', '400ms'));
  await expect.poll(active).toBe(1);

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const held = await active();
  await page.waitForTimeout(1500);
  expect(await active()).toBe(held);

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(active).not.toBe(held);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the home page shows its final state at once and nothing moves', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-signal]')).toHaveAttribute('data-state', 'print');
    // One photo stands still, so there is nothing to pause.
    await expect(page.locator('[data-hero-controls]')).toBeHidden();
    await expect(page.locator('[data-step="status"]')).toHaveAttribute('data-inview', '');
    await expect(page.locator('[data-turntable]')).toHaveAttribute('data-inview', '');
    // Reduced motion cuts every transition to 0.01ms (base.css); one caught in its single frame
    // moves nothing, so only animations that last longer count.
    const running = await page.evaluate(() =>
      document.getAnimations().filter((animation) => {
        const { duration } = animation.effect?.getComputedTiming() ?? {};
        return animation.playState === 'running' && !(typeof duration === 'number' && duration <= 1);
      }).length,
    );
    expect(running).toBe(0);
  });
});
