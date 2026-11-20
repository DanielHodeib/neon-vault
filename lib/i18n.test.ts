import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { achievements } from './achievements';
import { EVENT_TYPES } from './events';
import { GAME_NAMES, THEME_INFO, TICKET_CATEGORIES, TICKET_STATUS } from './format';
import { translate } from './i18n';
import { EN } from './i18n-en';
import { MESSAGES } from './messages';
import { QUESTS } from './quests';
import { MACHINES } from './slots';
import { SHOP_ITEMS, SLOT_LABEL } from './shop';
import { PLINKO_RISK_LABEL } from './solo';
import { TOURNAMENT_KINDS } from './tournament';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();

test('english keeps every {placeholder} of the german text', () => {
  for (const [de, en] of Object.entries(EN)) assert.equal(placeholders(en), placeholders(de), de);
});

test('every german data text has an english version (plain names may stay as they are)', () => {
  const texts = [
    ...Object.values(MACHINES).flatMap((m) => [m.name, m.tagline, m.feature]),
    ...QUESTS.flatMap((q) => [q.title, q.description]),
    ...SHOP_ITEMS.flatMap((i) => [i.name, i.description]),
    ...Object.values(SLOT_LABEL),
    ...Object.values(EVENT_TYPES).flatMap((e) => [e.label, e.description]),
    ...Object.values(TOURNAMENT_KINDS).flatMap((k) => [k.label, k.description, k.unit]),
    ...Object.values(GAME_NAMES),
    ...Object.values(THEME_INFO).map((t) => t.name),
    ...TICKET_CATEGORIES,
    ...Object.values(TICKET_STATUS),
    ...achievements({ bets: 0, biggestWin: 0, level: 1, friends: 0, gamesPlayed: 0, duelWins: 0, marketWins: 0 }).flatMap((a) => [a.title, a.description]),
    ...Object.values(PLINKO_RISK_LABEL),
  ];
  const missing = texts.filter((t) => !(t in EN) && !/^[A-Za-z0-9 -]+$/.test(t));
  assert.deepEqual(missing, []);
});

test('translate fills placeholders, falls back to german and matches server patterns', () => {
  assert.equal(translate('en', 'Tag {n}', { n: 3 }), 'Day 3');
  assert.equal(translate('de', 'Tag {n}', { n: 3 }), 'Tag 3');
  assert.equal(translate('en', 'Gibt es nicht'), 'Gibt es nicht');
  assert.equal(translate('en', 'Du bist jetzt mit Ana befreundet.'), 'You are now friends with Ana.');
  assert.equal(translate('en', 'Ace: Raise auf 300'), 'Ace: Raise to 300');
  assert.equal(translate('en', 'Daniel gewinnt 1.200 mit Zwei Paare'), 'Daniel wins 1.200 with Two pair');
});

test('message IDs: both languages keep the same {placeholders}, and translate picks by language', () => {
  for (const [id, m] of Object.entries(MESSAGES)) assert.equal(placeholders(m.en), placeholders(m.de), id);
  assert.equal(translate('de', 'err.minBet', { min: 50 }), 'Mindesteinsatz: 50 NVC.');
  assert.equal(translate('en', 'err.minBet', { min: 50 }), 'Minimum bet: 50 NVC.');
  assert.equal(translate('en', 'err.maxDuels', { max: 3 }), 'At most 3 open duels.');
  assert.equal(translate('en', 'constructor'), 'constructor', 'object prototype names are not IDs');
});

test('UserError carries code + vars for the client and the German text as message', async () => {
  const { UserError } = await import('./hub');
  const err = new UserError('err.minBet', { min: 50 });
  assert.deepEqual([err.code, err.vars, err.message], ['err.minBet', { min: 50 }, 'Mindesteinsatz: 50 NVC.']);
  assert.equal(new UserError('Gibt es nicht').message, 'Gibt es nicht'); // plain sentences still work
});

test('no UserError is built from a template literal: use an ID + vars so the client can translate it', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', '.next-e2e', '.next-prod', 'dist', '.git'].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts') && /new UserError\(`[^`]*\$\{/.test(readFileSync(p, 'utf8'))) offenders.push(p);
    }
  };
  for (const d of ['app', 'lib', 'game', 'components']) walk(d);
  assert.deepEqual(offenders, []);
});
