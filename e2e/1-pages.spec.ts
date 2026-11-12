import { expect, test } from '@playwright/test';

import { go, newName, PASSWORD, register, trackErrors } from './helpers';

test('register, log out, log in again', async ({ page }) => {
  const name = newName('anna');
  await register(page, name);
  await expect(page.locator('header').getByText('10.000')).toBeVisible(); // starting balance

  await page.getByRole('button', { name }).first().click(); // avatar menu
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Benutzername').first().fill(name);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
});

test('every page opens without a crash', async ({ page }) => {
  const errors = trackErrors(page);
  await register(page, newName('paul'));
  for (const path of ['/', '/arena', '/arena?tab=bets', '/friends', '/messages', '/tournament', '/leaderboard', '/quests', '/shop', '/shop?tab=bubble', '/stats', '/settings', '/support']) {
    const res = await go(page, path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('main')).toBeVisible();
  }
  // Ctrl+K quick search jumps to a game
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Spiel, Seite oder Spieler …').fill('limbo');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/play\/limbo/);
  expect(errors).toEqual([]);
});
