import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { toneMp3 } from '../../dev-mock/make-fixtures.mjs';
import { ARTIST, expect, test } from './fixtures.js';

test('an artist signs in, uploads a demo, sees its digest, verifies the file and signs out', async ({ page }, testInfo) => {
  const bytes = toneMp3({ frequency: 333, seconds: 2 });
  const changed = Buffer.from(bytes);
  changed[500] ^= 0x01;
  const file = testInfo.outputPath('take.mp3');
  const changedFile = testInfo.outputPath('take-one-bit-changed.mp3');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  writeFileSync(changedFile, changed);

  await page.goto('/portal/demos.html');
  await expect(page).toHaveURL(/\/login\.html\?next=%2Fportal%2Fdemos\.html$/);
  await page.getByLabel('E-posta adresi').fill(ARTIST.email);
  await page.getByLabel('Parola', { exact: true }).fill(ARTIST.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/portal\/demos\.html$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Gönderilerim' })).toBeVisible();
  await expect(page.locator('.demo-card')).toHaveCount(3);

  await page.getByRole('main').getByRole('link', { name: 'Demo yükle' }).click();
  await page.getByLabel('Parça adı').fill('Uçtan uca');
  await page.getByLabel('Tür').selectOption('ambient');
  await page.getByLabel('Ses dosyası').setInputFiles(file);
  await page.getByRole('button', { name: 'Yükle' }).click();

  await expect(page).toHaveURL(/\/portal\/demo\.html\?id=[\w-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Uçtan uca');
  await expect(page.getByRole('status').filter({ hasText: 'dosya yolda değişmedi' })).toBeVisible();
  await expect(page.locator('.digest .digest__value')).toHaveText(createHash('sha256').update(bytes).digest('hex'));

  // A file input has the button role; the section around it carries the same name.
  const verify = page.getByRole('button', { name: 'Dosyayı doğrula' });
  await verify.setInputFiles(file);
  await expect(page.getByText('Eşleşiyor:')).toBeVisible();
  await verify.setInputFiles(changedFile);
  await expect(page.getByText('Eşleşmiyor:')).toBeVisible();

  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL(/\/login\.html$/);
  await page.goto('/portal/demos.html');
  await expect(page).toHaveURL(/\/login\.html\?next=/);
});
