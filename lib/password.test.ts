import assert from 'node:assert/strict';
import { test } from 'node:test';

import bcrypt from 'bcryptjs';

import { hashPassword, verifyPassword } from './password';

test('password: new hashes verify, wrong passwords and tampered hashes do not', async () => {
  const hash = await hashPassword('correct horse');
  assert.ok(hash.startsWith('scrypt$'));
  assert.deepEqual(await verifyPassword('correct horse', hash), { ok: true, upgrade: false });
  assert.equal((await verifyPassword('wrong horse', hash)).ok, false);
  assert.equal((await verifyPassword('correct horse', `${hash.slice(0, -4)}AAAA`)).ok, false);
  assert.equal((await verifyPassword('correct horse', 'scrypt$garbage')).ok, false);
});

test('password: two hashes of the same password differ (random salt)', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});

test('password: old bcrypt hashes still work and ask for an upgrade', async () => {
  const legacy = await bcrypt.hash('old password', 4);
  assert.deepEqual(await verifyPassword('old password', legacy), { ok: true, upgrade: true });
  assert.deepEqual(await verifyPassword('nope', legacy), { ok: false, upgrade: true });
});
