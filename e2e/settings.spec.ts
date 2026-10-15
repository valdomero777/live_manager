import { expect, test } from '@playwright/test';

test('a saved setting survives a reload', async ({ page }) => {
  await page.goto('/admin/ajustes');
  const level = page.getByLabel('Nivel de log');
  await level.selectOption({ label: 'Errores' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Ajustes guardados')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Nivel de log')).toHaveValue('error');
});

test('shows the overlay key that goes in the overlay URLs', async ({ page }) => {
  await page.goto('/admin/ajustes');
  await expect(page.getByLabel('Clave de overlays')).toHaveValue(/^e2e-overlay-key-/);
});

test('the new passwords must match before they are sent', async ({ page }) => {
  await page.goto('/admin/ajustes');
  await page.getByRole('tab', { name: 'Seguridad' }).click();
  await page.getByLabel('Contraseña actual').fill('e2e-password-1');
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('another-password-2');
  await page.getByLabel('Repite la nueva contraseña').fill('different-password-3');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Las contraseñas nuevas no coinciden.')).toBeVisible();
});
