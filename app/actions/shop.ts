'use server';

import { refresh } from 'next/cache';

import { run } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import type { ShopSlot } from '@/lib/shop';
import * as shop from '@/lib/shopService';

// Thin wrappers: who is asking (cookie) and the page refresh live here, the rules in lib/shopService.ts.

export async function buyItem(id: string) {
  return run(async () => {
    const name = await shop.buyItem(await requireUser(), id);
    refresh();
    return `${name} gekauft und angelegt.`;
  });
}

export async function equipItem(slot: ShopSlot, id: string | null) {
  return run(async () => {
    await shop.equipItem((await requireUser()).id, slot, id);
    refresh();
    return id ? 'Angelegt.' : 'Abgelegt.';
  });
}
