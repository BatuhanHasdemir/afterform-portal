import { createHash } from 'node:crypto';
import { expect, test } from './fixtures.js';

test('the SHA-256 rounds are walked with ←/→ and Home/End', async ({ page }) => {
  await page.goto('/lab/sha256.html');
  const slider = page.getByRole('slider', { name: 'Tur (t)' });
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuetext', '1. tur (t = 0)');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '2. tur (t = 1)');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', '64. tur (t = 63)');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', '1. tur (t = 0)');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuetext', '1. tur (t = 0)');
});

test('the comparison shows all six digests of the input, MD5 and SHA3-256 included', async ({ page }) => {
  await page.goto('/lab/compare.html');
  const text = 'Biçimden sonra gelen ses.';
  await page.getByRole('textbox', { name: 'Girdi' }).fill(text);
  for (const [name, algorithm] of [['MD5', 'md5'], ['SHA-1', 'sha1'], ['SHA-256', 'sha256'], ['SHA-384', 'sha384'], ['SHA-512', 'sha512'], ['SHA3-256', 'sha3-256']]) {
    const item = page.locator('.cmp-digest').filter({ has: page.getByText(name, { exact: true }) });
    await expect(item.locator('.cmp-digest__value')).toHaveText(createHash(algorithm).update(text).digest('hex'));
  }
});
