import { expect, test } from '@playwright/test';

test('a simulated comment shows up in the live events', async ({ page }) => {
  const text = `hola desde e2e ${Date.now()}`;

  await page.goto('/admin/simulador');
  const form = page.getByRole('form', { name: 'Comentario' });
  await form.getByLabel('Usuario').fill('ana_e2e');
  await form.getByLabel('Texto').fill(text);
  await form.getByRole('button', { name: 'Enviar comentario' }).click();
  await expect(page.getByText('Enviado: 1 mensaje(s)')).toBeVisible();

  await page.goto('/admin/eventos');
  await expect(page.getByText(text)).toBeVisible();

  await page.getByRole('searchbox', { name: 'Buscar por usuario o texto' }).fill('no-coincide-xyz');
  await expect(page.getByText('Sin eventos que coincidan')).toBeVisible();
});

test('a simulated gift is listed with its quantity', async ({ page }) => {
  await page.goto('/admin/simulador');
  const form = page.getByRole('form', { name: 'Regalo' });
  await form.getByLabel('Usuario').fill('leo_e2e');
  await form.getByLabel('Nombre del regalo').fill('Rose');
  await form.getByLabel('Cantidad').fill('3');
  await form.getByRole('button', { name: 'Enviar regalo' }).click();

  await page.goto('/admin/eventos');
  await expect(page.getByText('leo_e2e').first()).toBeVisible();
  await expect(page.getByText(/envió 3 × Rose/).first()).toBeVisible();
});
