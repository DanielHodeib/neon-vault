import assert from 'node:assert/strict';
import test from 'node:test';

import { suggest } from './chatSuggest';

const names = ['Daniel', 'dana', 'Max'];

test('slash lists commands and filters by prefix', () => {
  assert.deepEqual(suggest('/', names).map((s) => s.key), ['tip', 'profil', 'clear']);
  assert.deepEqual(suggest('/ti', names).map((s) => s.text), ['/tip ']);
  assert.deepEqual(suggest('/x', names), []);
});

test('commands that take a name suggest players', () => {
  assert.deepEqual(suggest('/tip da', names).map((s) => s.text), ['/tip Daniel ', '/tip dana ']);
  assert.deepEqual(suggest('/tip Daniel 100', names), []);
  assert.deepEqual(suggest('/clear d', names), []);
});

test('@ completes names anywhere in the message', () => {
  assert.deepEqual(suggest('hi @m', names).map((s) => s.text), ['hi @Max ']);
  assert.deepEqual(suggest('mail@m', names), []);
  assert.deepEqual(suggest('hallo', names), []);
});
