import { ADMIN, ARTIST, expect, signIn, signOut, test } from './fixtures.js';

test('an artist gets the no-access view at /admin/', async ({ page }) => {
  await signIn(page, ARTIST);
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bu sayfaya erişimin yok');
  await expect(page.locator('#review-panel')).toHaveCount(0);
});

test('an admin decides on a demo from the review desk; the artist sees the decision and the note', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/admin/');
  // The desk's menu holds the team's own page only.
  await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link')).toHaveText(['Yönetim']);

  const open = page.getByRole('button', { name: /Kırık Saat/ });
  await open.click();
  await expect(open).toHaveAttribute('aria-current', 'true');
  const panel = page.locator('#review-panel');
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Kırık Saat');
  await expect(panel.getByRole('heading', { level: 2 })).toBeFocused();

  await panel.getByRole('radio', { name: 'Reddedildi' }).check();
  await panel.getByLabel('Sanatçıya not').fill('Derleme kapandı; bir sonrakine bekleriz.');
  await panel.getByRole('button', { name: 'Kararı kaydet' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kırık Saat: durum “Reddedildi” olarak kaydedildi.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Kırık Saat/ })).toContainText('Reddedildi');
  await expect(panel.getByRole('radio', { name: /Reddedildi/ })).toBeChecked();
  await expect(panel.getByText('Derleme kapandı; bir sonrakine bekleriz.')).toBeVisible();
  await expect(panel.getByLabel('Sanatçıya not')).toHaveValue('');
  const detail = await panel.getByRole('link', { name: 'Demo sayfasını aç' }).getAttribute('href');

  await signOut(page);
  await signIn(page, ARTIST);
  await page.goto(detail);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kırık Saat');
  await expect(page.locator('.demo-detail__head .status-badge')).toHaveText('Reddedildi');
  await expect(page.getByText('Derleme kapandı; bir sonrakine bekleriz.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Durumu değiştir/ })).toHaveCount(0);
});

test('on the demo page an admin still changes the status in a dialog that gives focus back', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Kırık Saat/ }).click();
  await page.locator('#review-panel').getByRole('link', { name: 'Demo sayfasını aç' }).click();

  const opener = page.getByRole('button', { name: 'Durumu değiştir (Kırık Saat)' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Durumu değiştir' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Yeni durum')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
