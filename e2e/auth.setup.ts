import { expect, test as setup } from '@playwright/test';
import { E2E_AUTH_FILE, E2E_PASSWORD } from './settings.js';

setup('sign in once and keep the session', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin\/inicio$/);
  await page.context().storageState({ path: E2E_AUTH_FILE });
});
