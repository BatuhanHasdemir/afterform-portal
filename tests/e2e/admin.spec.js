import { ADMIN, ARTIST, expect, signIn, signOut, test } from './fixtures.js';

test('an artist gets the no-access view at /admin/', async ({ page }) => {
  await signIn(page, ARTIST);
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bu sayfaya erişimin yok');
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('an admin changes a status with a note; the artist sees both after reloading', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/admin/');
  const row = page.getByRole('row', { name: /Kırık Saat/ });
  const opener = row.getByRole('button', { name: 'Durumu değiştir (Kırık Saat)' });

  // Escape closes the dialog and gives focus back to the button that opened it.
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Durumu değiştir' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Yeni durum')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await dialog.getByLabel('Yeni durum').selectOption('rejected');
  await dialog.getByLabel('Sanatçıya not').fill('Derleme kapandı; bir sonrakine bekleriz.');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(row.getByText('Reddedildi')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Kırık Saat: durum “Reddedildi” olarak kaydedildi.' })).toBeVisible();
  const detail = await row.getByRole('link', { name: 'Kırık Saat' }).getAttribute('href');

  await signOut(page);
  await signIn(page, ARTIST);
  await page.goto(detail);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kırık Saat');
  await expect(page.locator('.demo-detail__head .status-badge')).toHaveText('Reddedildi');
  await expect(page.getByText('Derleme kapandı; bir sonrakine bekleriz.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Durumu değiştir/ })).toHaveCount(0);
});
