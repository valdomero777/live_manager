import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

/**
 * A valid 8 kHz mono WAV of `samples` noise samples. The server stores files by content hash, so
 * every call must give different bytes for the upload to show up under its own name.
 */
function wav(samples = 800): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, randomBytes(samples)]);
}

test('uploads a sound, lists it and deletes it', async ({ page }) => {
  const file = `aplauso-e2e-${Date.now()}.wav`;
  await page.goto('/admin/assets');
  await page.locator('#file').setInputFiles({ name: file, mimeType: 'audio/wav', buffer: wav() });
  await expect(page.getByText('Archivo subido')).toBeVisible();
  await expect(page.getByText(file)).toBeVisible();

  await page.getByRole('article', { name: file }).getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Archivo eliminado')).toBeVisible();
  await expect(page.getByText(file)).toHaveCount(0);
});

test('rejects a file whose content is not a sound or an image', async ({ page }) => {
  await page.goto('/admin/assets');
  await page.locator('#file').setInputFiles({
    name: 'falso.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('esto no es un audio'),
  });
  await expect(page.getByText('Algunos archivos no se pudieron procesar')).toBeVisible();
  await expect(page.getByText(/falso\.wav/)).toBeVisible();
});
