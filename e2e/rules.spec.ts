import { expect, test } from '@playwright/test';
import { connectedScreens } from './health.js';
import { E2E_OVERLAY_KEY } from './settings.js';

const name = `E2E alerta ${Date.now()}`;
const alertText = 'E2E {nickname} envió {giftName}';

test('a rule needs a name before it can be saved', async ({ page }) => {
  await page.goto('/admin/reglas/nueva');
  await page.getByRole('button', { name: 'Guardar regla' }).click();
  await expect(page.getByText('Ponle un nombre a la regla.').first()).toBeVisible();
  await expect(page.getByText('Revisa un campo')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/reglas\/nueva$/);
});

test.describe('life cycle of a rule', () => {
  test.describe.configure({ mode: 'serial' });

  test('creates a rule and lists it', async ({ page }) => {
    await page.goto('/admin/reglas/nueva');
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Texto', exact: true }).fill(alertText);
    await page.getByRole('button', { name: 'Guardar regla' }).click();
    await expect(page.getByText('Regla guardada', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/reglas\/\d+$/);

    await page.goto('/admin/reglas');
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test('tests the saved rule with a sample event', async ({ page }) => {
    await page.goto('/admin/reglas');
    await page.getByRole('article', { name }).getByRole('link', { name: 'Probar' }).click();
    await page.getByRole('button', { name: 'Probar ahora' }).click();
    await expect(page.getByText('La regla se activó')).toBeVisible();
  });

  test('plays the alert on the overlay when a gift arrives', async ({ browser, page }) => {
    const overlay = await browser.newPage();
    await overlay.goto(`/screen/alerts/?key=${E2E_OVERLAY_KEY}`);
    await expect.poll(() => connectedScreens(page.request)).toMatchObject({ alerts: 1 });

    await page.goto('/admin/simulador');
    const form = page.getByRole('form', { name: 'Regalo' });
    await form.getByLabel('Usuario').fill('maria_e2e');
    await form.getByLabel('Nombre del regalo').fill('Rose');
    await form.getByRole('button', { name: 'Enviar regalo' }).click();

    await expect(overlay.getByText(/E2E maria_e2e envió Rose/)).toBeVisible();
    await overlay.close();
  });

  test('pauses and resumes the rule', async ({ page }) => {
    await page.goto('/admin/reglas');
    const rule = page.getByRole('article', { name });
    await rule.getByRole('switch').click();
    await expect(page.getByText(`«${name}» pausada`)).toBeVisible();
    await expect(rule.getByRole('switch')).not.toBeChecked();

    await rule.getByRole('switch').click();
    await expect(page.getByText(`«${name}» activada`)).toBeVisible();
    await expect(rule.getByRole('switch')).toBeChecked();
  });

  test('duplicates the rule as a paused copy', async ({ page }) => {
    await page.goto('/admin/reglas');
    await page.getByRole('button', { name: `Más acciones para ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(page.getByText('Regla duplicada')).toBeVisible();

    const copy = page.getByRole('article', { name: `${name} (copia)` });
    await expect(copy).toBeVisible();
    await expect(copy.getByRole('switch')).not.toBeChecked();
  });

  test('deletes the rule and its copy after confirming', async ({ page }) => {
    await page.goto('/admin/reglas');
    for (const title of [`${name} (copia)`, name]) {
      await page.getByRole('button', { name: `Más acciones para ${title}` }).click();
      await page.getByRole('menuitem', { name: 'Eliminar' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByText('Regla eliminada')).toBeVisible();
      await expect(page.getByRole('article', { name: title, exact: true })).toHaveCount(0);
    }
  });
});
