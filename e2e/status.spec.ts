import { expect, test } from '@playwright/test';
import { E2E_OVERLAY_KEY } from './settings.js';

test('shows the simulator as the live source and a healthy server', async ({ page }) => {
  await page.goto('/admin/estado');
  const connection = page.getByRole('region', { name: 'Conexión con TikTok' });
  await expect(connection).toContainText('@simulator');
  await expect(page.getByRole('region', { name: 'Sistema' })).toContainText('Todo correcto');
});

test('lists the overlay URLs with the overlay key', async ({ page }) => {
  await page.goto('/admin/estado');
  const urls = page.getByRole('region', { name: 'URLs de los overlays' });
  await expect(urls).toContainText(`/screen/audio/?key=${E2E_OVERLAY_KEY}`);
  await expect(urls).toContainText(`/screen/alerts/?key=${E2E_OVERLAY_KEY}`);
});

test('the dashboard shows the live session of the simulator', async ({ page }) => {
  await page.goto('/admin/inicio');
  await expect(page.getByRole('region', { name: 'Sesión LIVE' })).toContainText('@simulator');
});
