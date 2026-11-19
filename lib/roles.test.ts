import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Role } from '@prisma/client';

import { canEditSelf, canManage, mayManage } from './roles';

test('staff only manage people below them', () => {
  assert.ok(canManage('OWNER', 'ADMIN'));
  assert.ok(canManage('ADMIN', 'USER'));
  assert.ok(!canManage('ADMIN', 'ADMIN'));
  assert.ok(!canManage('OWNER', 'OWNER'));
  assert.ok(!canManage('SUPPORT', 'MODERATOR'));
});

test('mayManage: the permission matrix behind every admin action', () => {
  const a = (role: Role, id = 'a') => ({ id, role });
  // nobody touches an equal or higher role, whatever the action
  for (const [actor, target] of [['SUPPORT', 'SUPPORT'], ['MODERATOR', 'ADMIN'], ['ADMIN', 'ADMIN'], ['ADMIN', 'OWNER'], ['OWNER', 'OWNER']] as const) {
    assert.ok(!mayManage(a(actor, 'x'), a(target, 'y')), `${actor} -> ${target}`);
  }
  assert.ok(mayManage(a('MODERATOR', 'x'), a('USER', 'y')));
  assert.ok(mayManage(a('OWNER', 'x'), a('ADMIN', 'y')));
  // yourself: never, unless you are the owner and the action allows it (money, XP, quests)
  assert.ok(!mayManage(a('ADMIN'), a('ADMIN'), { self: true }));
  assert.ok(!mayManage(a('OWNER'), a('OWNER')));
  assert.ok(mayManage(a('OWNER'), a('OWNER'), { self: true }));
  assert.ok(!mayManage(a('OWNER', 'x'), a('OWNER', 'y'), { self: true })); // another owner is not "self"
});

test('only the owner may edit their own account', () => {
  assert.ok(canEditSelf('OWNER'));
  assert.ok(!canEditSelf('ADMIN'));
  assert.ok(!canEditSelf('USER'));
});
