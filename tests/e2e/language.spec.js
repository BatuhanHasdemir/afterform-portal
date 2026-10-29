import { expect, test } from './fixtures.js';

test('switching the language updates the page and <html lang> at once, and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Biçimden sonra gelen ses.');

  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sound that comes after form.');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/lab/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByRole('button', { name: 'TR', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
});
