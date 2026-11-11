import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickSegment, streakEnding } from './daily';
import { DAILY_SEGMENTS, streakMultiplier } from './games';

const DAY = 86_400_000;

test('streak counts consecutive days ending at a day', () => {
  const today = 100 * DAY;
  assert.equal(streakEnding([], today), 0);
  assert.equal(streakEnding([today], today), 1);
  assert.equal(streakEnding([today, today - DAY, today - 2 * DAY], today), 3);
  assert.equal(streakEnding([today, today - 2 * DAY], today), 1); // gap breaks it
  assert.equal(streakEnding([today - DAY, today - 2 * DAY], today - DAY), 2);
});

test('streak multiplier grows 10 % per day and caps at x1.9', () => {
  assert.equal(streakMultiplier(1), 1);
  assert.equal(streakMultiplier(5), 1.4);
  assert.equal(streakMultiplier(10), 1.9);
  assert.equal(streakMultiplier(50), 1.9);
});

test('segment picking follows the weights', () => {
  const total = DAILY_SEGMENTS.reduce((s, x) => s + x.weight, 0);
  assert.equal(pickSegment(() => 0), 0);
  assert.equal(pickSegment(() => total - 1), DAILY_SEGMENTS.length - 1);
  const ev = DAILY_SEGMENTS.reduce((s, x) => s + x.value * x.weight, 0) / total;
  assert.ok(ev > 3_000 && ev < 5_000, `expected base ${ev}`);
});
