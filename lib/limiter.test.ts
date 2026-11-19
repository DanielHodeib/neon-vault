import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLimiter } from './limiter';

test('limiter: allows max hits per window, then blocks, then frees up', () => {
  const l = createLimiter(3, 1000);
  assert.ok(l.hit('a', 0) && l.hit('a', 100) && l.hit('a', 200));
  assert.ok(!l.hit('a', 300));
  assert.ok(!l.hit('a', 999)); // blocked tries do not extend the block
  assert.ok(l.hit('a', 1000)); // the first hit has left the window
});

test('limiter: keys are independent', () => {
  const l = createLimiter(1, 1000);
  assert.ok(l.hit('alice', 0));
  assert.ok(!l.hit('alice', 1));
  assert.ok(l.hit('bob', 1));
});

test('limiter: memory stays bounded and one flood does not reset everybody', () => {
  const l = createLimiter(1, 60_000, 100);
  assert.ok(l.hit('victim', 0));
  for (let i = 0; i < 500; i++) l.hit(`flood-${i}`, 1 + i);
  assert.ok(l.size <= 100);
  assert.ok(!l.hit('flood-499', 600)); // newest keys keep their counters
});

test('limiter: expired keys are swept first', () => {
  const l = createLimiter(1, 1000, 10);
  for (let i = 0; i < 10; i++) l.hit(`old-${i}`, 0);
  l.hit('new', 5000); // 11th key: the ten old ones are expired and go
  assert.equal(l.size, 1);
});
