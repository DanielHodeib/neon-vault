import { expect, test } from '@playwright/test';

import { go, newName, register, reload, trackErrors } from './helpers';

// Two players in two browsers: become friends, duel, bet, watch.
test('friends, duel, bet and watching with two players', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const errors = [...trackErrors(a), ...trackErrors(b)];
  const nameA = newName('alex');
  const nameB = newName('bea');
  await register(a, nameA);
  await register(b, nameB);

  // Friend request, accepted right in the notification panel
  await go(a, '/friends');
  await a.locator('main').getByPlaceholder('Benutzername').fill(nameB);
  await a.getByRole('button', { name: 'Hinzufügen' }).click();
  await expect(a.getByText('Anfrage gesendet.')).toBeVisible(); // stored on the server before B looks
  await reload(b);
  await b.getByRole('button', { name: 'Benachrichtigungen' }).click();
  await b.getByRole('button', { name: 'Annehmen' }).click();
  await expect(b.getByText('Ihr seid jetzt befreundet.')).toBeVisible();

  // Duel: A challenges B, B accepts, the replay names a winner (or a tie)
  await go(a, '/arena');
  await a.locator('#duel-to:visible').selectOption(nameB);
  await a.getByRole('button', { name: /Herausfordern/ }).click();
  await expect(a.getByText(nameA).locator('xpath=ancestor::li').getByRole('button', { name: 'Zurückziehen' })).toBeVisible();
  await go(b, '/arena');
  await b.getByRole('button', { name: 'Annehmen' }).click();
  await expect(b.getByText(/gewinnt .* NVC|Unentschieden – beide/)).toBeVisible({ timeout: 30_000 });

  // Bet: A asks, B bets on "Ja", A settles
  await go(a, '/arena?tab=bets');
  await a.getByRole('button', { name: /Neue Wette/ }).click();
  await a.getByLabel('Frage').fill('Wird dieser Test grün?');
  await a.getByRole('button', { name: 'Wette eröffnen' }).click();
  await expect(a.getByText('Wird dieser Test grün?')).toBeVisible();
  await go(b, '/arena?tab=bets');
  await b.locator('article:visible').getByRole('button', { name: /^Ja/ }).click();
  await expect(b.getByText(/NVC auf „Ja“/)).toBeVisible();
  a.on('dialog', (d) => d.accept());
  await reload(a);
  await a.locator('article:visible').getByRole('button', { name: 'Ja' }).last().click();
  await expect(a.getByText(/Entschieden: Ja/)).toBeVisible();

  // Watching: B watches A, A plays dice, B sees the round
  await go(b, `/watch/${nameA}`);
  await expect(b.getByRole('heading', { name: `Du schaust ${nameA} zu` })).toBeVisible();
  await go(a, '/play/dice');
  await a.locator('main').getByRole('button', { name: 'Würfeln' }).click();
  await expect(b.locator('main').getByText('Dice').first()).toBeVisible({ timeout: 30_000 });

  expect(errors).toEqual([]);
});
