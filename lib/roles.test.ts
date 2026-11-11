import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canEditSelf, canManage } from './roles';

test('staff only manage people below them', () => {
  assert.ok(canManage('OWNER', 'ADMIN'));
  assert.ok(canManage('ADMIN', 'USER'));
  assert.ok(!canManage('ADMIN', 'ADMIN'));
  assert.ok(!canManage('OWNER', 'OWNER'));
  assert.ok(!canManage('SUPPORT', 'MODERATOR'));
});

test('only the owner may edit their own account', () => {
  assert.ok(canEditSelf('OWNER'));
  assert.ok(!canEditSelf('ADMIN'));
  assert.ok(!canEditSelf('USER'));
});
