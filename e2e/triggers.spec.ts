import { expect, test } from '@playwright/test';

test('a trigger needs a name and a sound before it can be saved', async ({ page }) => {
  await page.goto('/admin/triggers');
  await page.getByRole('button', { name: 'Nuevo trigger' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nuevo trigger' })).toBeVisible();

  await page.getByRole('button', { name: 'Guardar trigger' }).click();
  await expect(page.getByText('Ponle un nombre al trigger.')).toBeVisible();

  await page.getByLabel('Nombre', { exact: true }).fill('Trigger e2e');
  await page.getByRole('button', { name: 'Guardar trigger' }).click();
  await expect(page.getByText('Elige un sonido.')).toBeVisible();
});
