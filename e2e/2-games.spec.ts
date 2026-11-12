import { expect, test, type Page } from '@playwright/test';

import { go, newName, register, trackErrors } from './helpers';

// One small round of every solo game: the button works, a result shows up, nothing crashes.
test.describe.configure({ mode: 'serial' });
let page: Page;
let errors: string[];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  errors = trackErrors(page);
  await register(page, newName('gina'));
});
test.afterAll(() => expect(errors).toEqual([]));

const main = () => page.locator('main');
const button = (name: string | RegExp) => main().getByRole('button', { name }).first();

test('dice', async () => {
  await go(page, '/play/dice');
  await button('Würfeln').click();
  await expect(main().getByText(/^\d{1,2},\d{2}$/).first()).toBeVisible(); // the rolled number, win or lose
});

test('plinko', async () => {
  await go(page, '/play/plinko');
  await button('Ball fallen lassen').click();
  await expect(main().getByText('Letzte Bälle')).toBeVisible();
});

test('slots', async () => {
  await go(page, '/play/slots');
  await button(/^Drehen|^Spin/).click();
  // A win can start free spins, which play on by themselves for a while.
  await expect(button(/^Drehen|^Spin/)).toBeEnabled({ timeout: 75_000 });
});

test('limbo', async () => {
  await go(page, '/play/limbo');
  await button('Los').click();
  await expect(main().getByText(/Ziel 2× (erreicht|verpasst)/)).toBeVisible();
});

test('keno', async () => {
  await go(page, '/play/keno');
  await button('Zufällig').click();
  await button('Ziehen').click();
  await expect(main().getByText(/Treffer/).first()).toBeVisible();
});

test('scratch card', async () => {
  await go(page, '/play/scratch');
  await button(/Los kaufen/).click();
  await button('Alles aufdecken').click();
  await expect(main().getByText(/NVC|Leider nichts/).first()).toBeVisible();
});

test('tower', async () => {
  await go(page, '/play/tower');
  await button('Start').click();
  await main().getByRole('button', { name: 'Stockwerk 1, Tür 1' }).click();
  await expect(main().getByText(/Stockwerk 2 von 8|In die Falle getappt/)).toBeVisible();
});

test('video poker', async () => {
  await go(page, '/play/vpoker');
  await button('Geben').click();
  await button(/^Ziehen/).click();
  await expect(main().getByText(/Nichts dabei|NVC/).first()).toBeVisible();
});

test('baccarat', async () => {
  await go(page, '/play/baccarat');
  await button('Geben').click();
  await expect(main().getByText(/gewinnt|Unentschieden/).first()).toBeVisible();
});

test('mines', async () => {
  await go(page, '/play/mines');
  await button('Start').click();
  await main().getByRole('button', { name: 'Feld 1', exact: true }).click();
  await expect(main().getByText(/Nächstes Feld|Mine getroffen/)).toBeVisible();
});

test('hi-lo', async () => {
  await go(page, '/play/hilo');
  await button('Start').click();
  await button(/^Höher/).click();
  await expect(page.getByRole('button', { name: /^Start|^Auszahlen/ }).first()).toBeVisible();
});

test('coinflip against the house', async () => {
  await go(page, '/play/coinflip');
  await button('Münze werfen').click();
  await expect(main().getByText(/gewonnen!|leider daneben\./).first()).toBeVisible();
});
