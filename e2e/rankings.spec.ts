import { expect, test } from '@playwright/test';

test('a gift moves the ranking', async ({ page }) => {
  await page.goto('/admin/simulador');
  const form = page.getByRole('form', { name: 'Regalo' });
  await form.getByLabel('Usuario').fill('rank_e2e');
  await form.getByLabel('Monedas c/u').fill('7');
  await form.getByLabel('Cantidad').fill('1');
  await form.getByRole('button', { name: 'Enviar regalo' }).click();

  await page.goto('/admin/rankings');
  const row = page.getByRole('row').filter({ hasText: 'rank_e2e' });
  await expect(row).toContainText('7');
});

test('creates a goal and deletes it', async ({ page }) => {
  const name = `Meta e2e ${Date.now()}`;
  await page.goto('/admin/rankings');
  await page.getByRole('button', { name: 'Nueva meta' }).first().click();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Objetivo').fill('5');
  await page.getByRole('button', { name: 'Crear meta' }).click();
  await expect(page.getByText(`Meta «${name}» guardada`)).toBeVisible();
  await expect(page.getByRole('article', { name })).toBeVisible();

  await page.getByRole('button', { name: `Eliminar ${name}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Meta eliminada')).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
});
