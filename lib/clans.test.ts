import assert from 'node:assert/strict';
import test from 'node:test';

import { CLAN_NAME, CLAN_TAG } from './clans';

test('clan name and tag rules', () => {
  assert.ok(CLAN_NAME.test('Neon Wölfe') && CLAN_NAME.test('A-B'));
  assert.ok(!CLAN_NAME.test('ab') && !CLAN_NAME.test('x'.repeat(21)) && !CLAN_NAME.test('<b>hi</b>'));
  assert.ok(CLAN_TAG.test('NIG') && CLAN_TAG.test('A1'));
  assert.ok(!CLAN_TAG.test('a') && !CLAN_TAG.test('TOOLONG') && !CLAN_TAG.test('N G'));
});
