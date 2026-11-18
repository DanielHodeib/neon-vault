import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

import { go, newName, register } from './helpers';

// Two players: A founds a clan, B joins it and gets the tag automatically.
test('clans: found, join, tag follows the clan, leave', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const nameA = newName('ca');
  const nameB = newName('cb');
  await register(a, nameA);
  await register(b, nameB);
  execSync(`sqlite3 prisma/e2e.db "update User set balance=100000 where username='${nameA}'"`);

  const tag = nameA.slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  await go(a, '/clans?tab=found');
  await a.getByLabel('Name', { exact: true }).fill(`Clan ${tag}`);
  await a.getByLabel('Tag', { exact: true }).fill(tag);
  await a.getByRole('button', { name: /Gründen/ }).click();
  await expect(a.getByRole('heading', { name: `[${tag}] Clan ${tag}` })).toBeVisible();

  await go(b, '/clans');
  await b.getByRole('button', { name: 'Beitreten' }).click();
  await expect(b.getByText(`Willkommen bei [${tag}]!`)).toBeVisible();
  // perks tab and clan chat between both members
  await go(b, '/clans?tab=perks');
  await expect(b.getByRole('heading', { name: 'Clan-Level 1' })).toBeVisible();
  await go(a, '/clans?tab=chat');
  await go(b, '/clans?tab=chat');
  const input = b.locator('input[aria-label="Nachricht an den Clan …"]:visible');
  await input.fill('Hallo Clan');
  await input.press('Enter');
  await expect(a.getByText('Hallo Clan').locator('visible=true')).toBeVisible();
  await go(b, `/profile/${nameB}`);
  await expect(b.getByText(`[${tag}]`).first()).toBeVisible();

  await go(b, '/settings');
  await expect(b.getByText('Clan-Tag')).toHaveCount(0);

  await go(b, '/clans');
  b.once('dialog', (d) => d.accept());
  await b.getByRole('button', { name: 'Clan verlassen' }).click();
  await expect(b.getByText('Du hast den Clan verlassen.')).toBeVisible();
});
