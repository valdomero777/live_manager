import { expect, test } from '@playwright/test';
import { connectedScreens } from './health.js';
import { E2E_OVERLAY_KEY } from './settings.js';

test('the configurator builds the overlay URL with the overlay key', async ({ page }) => {
  await page.goto('/admin/overlays');
  const url = page.locator('code').filter({ hasText: '/overlay/leaderboard/' });
  await expect(url).toContainText(`key=${E2E_OVERLAY_KEY}`);

  await page.getByLabel('Overlay', { exact: true }).selectOption({ label: 'Alertas' });
  await expect(page.locator('code').filter({ hasText: '/screen/alerts/' })).toContainText(
    `key=${E2E_OVERLAY_KEY}`,
  );
});

test('saves a template, lists it and deletes it', async ({ page }) => {
  const name = `Plantilla e2e ${Date.now()}`;
  await page.goto('/admin/overlays');
  await page.getByLabel('Guardar como plantilla').fill(name);
  await page.getByRole('button', { name: 'Guardar plantilla' }).click();
  await expect(page.getByText('Plantilla guardada')).toBeVisible();
  const saved = page.getByRole('region', { name: 'Plantillas guardadas' });
  await expect(saved.getByText(name)).toBeVisible();

  await saved.getByRole('button', { name: `Eliminar ${name}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(saved.getByText(name)).toHaveCount(0);
});

test('an overlay with the right key connects to the server', async ({ browser, request }) => {
  const overlay = await browser.newPage();
  await overlay.goto(`/screen/audio/?key=${E2E_OVERLAY_KEY}`);
  // Browsers only allow sound after a click, so the audio screen waits for one before it connects.
  await overlay.getByRole('button', { name: 'Iniciar audio' }).click();
  await expect.poll(() => connectedScreens(request)).toMatchObject({ audio: 1 });
  await overlay.close();
});

test('a ready-made template loads into the configurator, can be edited and saved', async ({
  page,
}) => {
  const name = `Cinta e2e ${Date.now()}`;
  await page.goto('/admin/overlays');
  const presets = page.getByRole('region', { name: 'Plantillas predefinidas' });
  await presets
    .getByRole('listitem')
    .filter({ hasText: 'Cinta de anuncios' })
    .getByRole('button')
    .click();

  await expect(page.locator('code').filter({ hasText: '/overlay/ticker/' })).toBeVisible();
  await page.getByLabel('Mensajes', { exact: true }).fill('Hola\nAdiós');
  await expect(page.locator('code').filter({ hasText: '/overlay/ticker/' })).toContainText(
    'messages=Hola%7CAdi%C3%B3s',
  );

  await page.getByLabel('Guardar como plantilla').fill(name);
  await page.getByRole('button', { name: 'Guardar plantilla' }).click();
  const saved = page.getByRole('region', { name: 'Plantillas guardadas' });
  await expect(saved.getByText(name)).toBeVisible();

  await saved.getByRole('button', { name: `Eliminar ${name}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(saved.getByText(name)).toHaveCount(0);
});
