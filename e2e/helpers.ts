import { expect, type Page } from '@playwright/test';

/** A fresh account per test run: names must be unique, the database starts empty. */
export const newName = (prefix: string) => `${prefix}_${Date.now().toString(36).slice(-5)}`;
export const PASSWORD = 'e2e-test-passwort';

/** Opens a page and waits until it is hydrated and the live connection is up (`<html data-live>`). */
export async function go(page: Page, path: string) {
  const res = await page.goto(path);
  await page.locator('html[data-live]').waitFor({ state: 'attached', timeout: 30_000 });
  return res;
}

/** Reloads and waits for the live connection again. */
export async function reload(page: Page) {
  await page.reload();
  await page.locator('html[data-live]').waitFor({ state: 'attached', timeout: 30_000 });
}

export async function register(page: Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('Benutzername').fill(username);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
  await page.locator('input[type=checkbox]').check(); // terms
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: username })).toBeVisible();
  await page.locator('html[data-live]').waitFor({ state: 'attached', timeout: 30_000 });
}

/** Collects page errors (uncaught exceptions) so a test can assert there were none. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

