'use server';

import { refresh } from 'next/cache';

import { run } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { db, UserError } from '@/lib/hub';
import { shopItem, type ShopSlot } from '@/lib/shop';
import { applyLedger } from '@/lib/wallet';

// Item ids arrive from the browser (bound arguments), so each one is checked against the catalog.

export async function buyItem(id: string) {
  return run(async () => {
    const user = await requireUser();
    const item = shopItem(id);
    if (!item) throw new UserError('Unbekannter Artikel.');
    // The purchase row first: its primary key stops a double click from paying twice.
    try {
      await db.shopPurchase.create({ data: { userId: user.id, item: item.id } });
    } catch {
      throw new UserError('Das hast du schon.');
    }
    try {
      await applyLedger([{ userId: user.id, amount: -item.price, kind: 'SHOP', note: item.name }]);
    } catch (err) {
      await db.shopPurchase.delete({ where: { userId_item: { userId: user.id, item: item.id } } });
      throw err;
    }
    await db.user.update({ where: { id: user.id }, data: { [item.slot]: item.id } });
    refresh();
    return `${item.name} gekauft und angelegt.`;
  });
}

export async function equipItem(slot: ShopSlot, id: string | null) {
  return run(async () => {
    const user = await requireUser();
    if (!['frame', 'title', 'nameEffect'].includes(slot)) throw new UserError('Ungültig.');
    if (id !== null) {
      const item = shopItem(id);
      if (!item || item.slot !== slot) throw new UserError('Unbekannter Artikel.');
      if (!(await db.shopPurchase.findUnique({ where: { userId_item: { userId: user.id, item: id } } }))) throw new UserError('Den Artikel besitzt du nicht.');
    }
    await db.user.update({ where: { id: user.id }, data: { [slot]: id } });
    refresh();
    return id ? 'Angelegt.' : 'Abgelegt.';
  });
}
