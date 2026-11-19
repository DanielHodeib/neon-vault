import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import bcrypt from 'bcryptjs';

import { newName, PASSWORD, register } from './helpers';

// The query goes in via stdin: a bcrypt hash is full of `$` that a shell would expand.
const sql = (query: string) => execSync('sqlite3 prisma/e2e.db', { input: query }).toString().trim();

async function login(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Benutzername').fill(username);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

test('a normal player cannot open the admin area', async ({ page }) => {
  await register(page, newName('nu'));
  for (const path of ['/admin', '/admin?tab=server', '/admin?tab=players']) {
    await page.goto(path);
    await expect(page).toHaveURL('/');
  }
});

test('login: new scrypt hash works, wrong password and unknown name are rejected alike', async ({ browser }) => {
  const name = newName('lg');
  await register(await (await browser.newContext()).newPage(), name);
  expect(sql(`select passwordHash from User where username='${name}'`)).toMatch(/^scrypt\$/);

  const page = await (await browser.newContext()).newPage();
  await login(page, name, 'falsches-passwort');
  await expect(page.getByText('Benutzername oder Passwort falsch.')).toBeVisible();
  await login(page, 'gibt_es_nicht_xyz', PASSWORD);
  await expect(page.getByText('Benutzername oder Passwort falsch.')).toBeVisible();
  await login(page, name, PASSWORD);
  await expect(page).toHaveURL('/');
});

test('login: an old bcrypt hash still works and is upgraded to scrypt', async ({ browser }) => {
  const name = newName('bc');
  await register(await (await browser.newContext()).newPage(), name);
  const legacy = await bcrypt.hash(PASSWORD, 4);
  sql(`update User set passwordHash='${legacy}' where username='${name}'`);

  const page = await (await browser.newContext()).newPage();
  await login(page, name, PASSWORD);
  await expect(page).toHaveURL('/');
  expect(sql(`select passwordHash from User where username='${name}'`)).toMatch(/^scrypt\$/);
});
