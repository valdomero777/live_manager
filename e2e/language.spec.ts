import { expect, test } from '@playwright/test';

test('the panel switches to English and back to Spanish', async ({ page }) => {
  await page.goto('/admin/inicio');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toContainText('Reglas');

  await page.getByRole('button', { name: 'Idioma' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Rules');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.goto('/admin/reglas');
  await expect(page.getByRole('heading', { level: 1, name: 'Rules' })).toBeVisible();
  await expect(page).toHaveTitle('Rules · TikLive');

  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitemradio', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reglas' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});
