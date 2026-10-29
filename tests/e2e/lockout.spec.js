import { expect, test } from './fixtures.js';

test('the fifth failed sign-in shows the wait and a countdown, without naming an account', async ({ page }) => {
  await page.goto('/login.html');
  await page.getByLabel('E-posta adresi').fill('someone@afterform.test');
  const submit = page.getByRole('button', { name: 'Giriş yap' });
  const alert = page.getByRole('alert').filter({ hasText: /\S/ });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await page.getByLabel('Parola', { exact: true }).fill(`wrong-password-${attempt}`);
    await Promise.all([page.waitForResponse((res) => res.url().endsWith('/api/auth/login')), submit.click()]);
    if (attempt < 5) await expect(alert).toHaveText('E-posta adresi veya parola hatalı.');
  }

  await expect(alert).toHaveText('Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar dene.');
  await expect(alert).not.toContainText(/hesap|kilit/i);
  await expect(page.getByRole('timer')).toHaveText(/^1[45]:\d\d$/);
  await expect(submit).toHaveAttribute('aria-disabled', 'true');
});
