import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { useTempDb } from './testdb';

// Buying and equipping, against a real (temporary) database.
type Mods = { hub: typeof import('./hub'); shop: typeof import('./shopService'); catalog: typeof import('./shop') };
let m: Mods;
let n = 0;

before(async () => {
  useTempDb();
  m = { hub: await import('./hub'), shop: await import('./shopService'), catalog: await import('./shop') };
});
after(() => m.hub.db.$disconnect());

const user = async (balance: number) => {
  const u = await m.hub.db.user.create({ data: { username: `s${n++}`, passwordHash: 'x', balance } });
  return { id: u.id, clanId: null as string | null };
};
const row = (id: string) => m.hub.db.user.findUniqueOrThrow({ where: { id } });
const item = (slot: string) => m.catalog.SHOP_ITEMS.find((i) => i.slot === slot)!;

test('buying pays the price once and equips the item', async () => {
  const u = await user(1_000_000);
  const it = item('frame');
  await m.shop.buyItem(u, it.id);
  const after = await row(u.id);
  assert.equal(Number(after.balance), 1_000_000 - it.price);
  assert.equal(after.frame, it.id);
  await assert.rejects(m.shop.buyItem(u, it.id), /schon/); // double click / replay
  assert.equal(Number((await row(u.id)).balance), 1_000_000 - it.price, 'not charged twice');
});

test('buying: unknown items and too little money change nothing', async () => {
  const poor = await user(0);
  await assert.rejects(m.shop.buyItem(poor, 'does-not-exist'), /Unbekannt/);
  const it = item('title');
  await assert.rejects(m.shop.buyItem(poor, it.id), /Guthaben/);
  assert.equal(await m.hub.db.shopPurchase.count({ where: { userId: poor.id } }), 0, 'no purchase row is left behind');
  assert.equal((await row(poor.id)).title, null);
  await m.hub.db.user.update({ where: { id: poor.id }, data: { balance: it.price } });
  await m.shop.buyItem(poor, it.id); // the same item can be bought once the money is there
  assert.equal((await row(poor.id)).title, it.id);
});

test('equipping: only what you own, only in its own slot', async () => {
  const [a, b] = [await user(10_000_000), await user(10_000_000)];
  const frame = item('frame');
  const title = item('title');
  await m.shop.buyItem(a, frame.id);
  await assert.rejects(m.shop.equipItem(b.id, 'frame', frame.id), /nicht/); // another player's purchase is not yours
  await assert.rejects(m.shop.equipItem(a.id, 'title', frame.id), /Unbekannt/); // wrong slot
  await assert.rejects(m.shop.equipItem(a.id, 'title', title.id), /nicht/); // not bought
  await assert.rejects(m.shop.equipItem(a.id, 'passwordHash' as never, frame.id), /Ungültig/); // slots are a closed list
  assert.equal((await row(b.id)).frame, null);
  await m.shop.equipItem(a.id, 'frame', null);
  assert.equal((await row(a.id)).frame, null);
  await m.shop.equipItem(a.id, 'frame', frame.id);
  assert.equal((await row(a.id)).frame, frame.id);
});
