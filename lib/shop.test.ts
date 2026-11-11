import assert from 'node:assert/strict';
import test from 'node:test';

import { SHOP_ITEMS, shopItem } from './shop';

test('shop catalog: unique ids, positive whole prices, every slot styled', () => {
  assert.equal(new Set(SHOP_ITEMS.map((i) => i.id)).size, SHOP_ITEMS.length);
  for (const i of SHOP_ITEMS) {
    assert.ok(Number.isSafeInteger(i.price) && i.price > 0, i.id);
    if (i.slot === 'frame') assert.ok(i.frame, i.id);
    if (i.slot === 'nameEffect') assert.ok(i.className, i.id);
  }
  assert.equal(shopItem('nope'), undefined);
  assert.equal(shopItem(null), undefined);
});
