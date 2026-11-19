import { clanLevelOf } from './clanStats';
import { shopPrice } from './clans';
import { db, UserError } from './hub';
import { SHOP_SLOTS, shopItem, type ShopSlot } from './shop';
import { applyLedger } from './wallet';

// Shop rules without Next.js (cookies, refresh): app/actions/shop.ts wraps these, the tests call them directly.
// Item ids arrive from the browser (bound arguments), so each one is checked against the catalog.

/** Buys and equips an item for the clan-discounted price; returns its name. */
export async function buyItem(user: { id: string; clanId: string | null }, id: string) {
  const item = shopItem(id);
  if (!item) throw new UserError('Unbekannter Artikel.');
  // The purchase row first: its primary key stops a double click from paying twice.
  try {
    await db.shopPurchase.create({ data: { userId: user.id, item: item.id } });
  } catch {
    throw new UserError('Das hast du schon.');
  }
  try {
    await applyLedger([{ userId: user.id, amount: -shopPrice(item.price, (await clanLevelOf(user.clanId)).level), kind: 'SHOP', note: item.name }]);
  } catch (err) {
    await db.shopPurchase.delete({ where: { userId_item: { userId: user.id, item: item.id } } });
    throw err;
  }
  await db.user.update({ where: { id: user.id }, data: { [item.slot]: item.id } });
  return item.name;
}

/** Equips an owned item, or empties the slot when `id` is null. */
export async function equipItem(userId: string, slot: ShopSlot, id: string | null) {
  if (!SHOP_SLOTS.includes(slot)) throw new UserError('Ungültig.');
  if (id !== null) {
    const item = shopItem(id);
    if (!item || item.slot !== slot) throw new UserError('Unbekannter Artikel.');
    if (!(await db.shopPurchase.findUnique({ where: { userId_item: { userId, item: id } } }))) throw new UserError('Den Artikel besitzt du nicht.');
  }
  await db.user.update({ where: { id: userId }, data: { [slot]: id } });
}
