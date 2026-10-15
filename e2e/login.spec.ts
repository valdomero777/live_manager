import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './settings.js';

test.use({ storageState: { cookies: [], origins: [] } });

test('redirects to the login page when there is no session', async ({ page }) => {
  await page.goto('/admin/reglas');
  await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
});

test('rejects a wrong password and stays on the login page', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Contraseña').fill('not-the-password');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);
});

test('signs in and out', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin\/inicio$/);

  await page.getByRole('button', { name: 'Cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);

  await page.goto('/admin/inicio');
  await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);
});
