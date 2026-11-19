import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import bcrypt from 'bcryptjs';

// scrypt runs on libuv's thread pool, so a login never freezes the running games
// (bcryptjs does its work on the main thread). Old bcrypt hashes still work and are upgraded on login.
const N = 32_768;
const R = 8;
const P = 1;
const KEY_LEN = 64;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** `upgrade` = the stored hash is the old bcrypt kind: save a fresh scrypt hash after a successful login. */
export async function verifyPassword(password: string, stored: string) {
  if (stored.startsWith('scrypt$')) {
    const [, n, r, p, salt, hash] = stored.split('$');
    const expected = Buffer.from(hash ?? '', 'base64');
    const actual = await derive(password, Buffer.from(salt ?? '', 'base64'), Number(n), Number(r), Number(p)).catch(() => null);
    return { ok: !!actual && actual.length === expected.length && timingSafeEqual(actual, expected), upgrade: false };
  }
  return { ok: await bcrypt.compare(password, stored).catch(() => false), upgrade: true };
}

let dummy: Promise<string> | undefined;
/** Burns the same time as a real check, so an unknown username answers as slowly as a wrong password. */
export async function fakeVerify(password: string) {
  dummy ??= hashPassword('not-a-real-password');
  await verifyPassword(password, await dummy);
}
