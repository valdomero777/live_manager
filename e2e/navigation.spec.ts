import { expect, test } from '@playwright/test';

const SECTIONS = [
  { link: 'Conexión y estado', path: 'estado', title: 'Conexión y estado' },
  { link: 'Eventos', path: 'eventos', title: 'Eventos en vivo' },
  { link: 'Simulador', path: 'simulador', title: 'Simulador' },
  { link: 'Reglas', path: 'reglas', title: 'Reglas' },
  { link: 'Triggers de sonido', path: 'triggers', title: 'Triggers de sonido' },
  { link: 'Sonidos e imágenes', path: 'assets', title: 'Sonidos e imágenes' },
  { link: 'Overlays', path: 'overlays', title: 'Overlays' },
  { link: 'Rankings y metas', path: 'rankings', title: 'Rankings y metas' },
  { link: 'Ajustes', path: 'ajustes', title: 'Ajustes' },
];

test('every section of the sidebar opens its page', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/admin\/inicio$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  const menu = page.getByRole('navigation', { name: 'Principal' });
  for (const section of SECTIONS) {
    await menu.getByRole('link', { name: section.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${section.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: section.title })).toBeVisible();
  }
});

test('an unknown address goes back to the dashboard', async ({ page }) => {
  await page.goto('/admin/no-existe');
  await expect(page).toHaveURL(/\/admin\/inicio$/);
});
