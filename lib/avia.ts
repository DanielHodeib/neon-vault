// Avia Masters: pure rules, shared by the server engine and the browser.
// A plane flies past AVIA_SLOTS items. "+n" adds to the multiplier, "×n" multiplies it, a rocket halves it.
// At the end it lands on the carrier (pays stake × multiplier) or falls into the water (pays nothing).

export type AviaItem = { kind: 'add' | 'mul'; n: number } | { kind: 'rocket' } | { kind: 'none' };

export const AVIA_SLOTS = 5;
export const AVIA_MAX = 1000; // multiplier cap
export const AVIA_START = 1;
/** Chance to land on the carrier. With the item weights below the round returns ≈ 97 % (checked by game/avia.test.ts). */
export const AVIA_LAND = 0.392;

/** Relative weights of what the plane meets in one slot. */
export const AVIA_ITEMS: { item: AviaItem; weight: number }[] = [
  { item: { kind: 'none' }, weight: 192 },
  { item: { kind: 'rocket' }, weight: 112 },
  { item: { kind: 'add', n: 1 }, weight: 40 },
  { item: { kind: 'add', n: 2 }, weight: 24 },
  { item: { kind: 'add', n: 5 }, weight: 8 },
  { item: { kind: 'add', n: 10 }, weight: 2 },
  { item: { kind: 'mul', n: 2 }, weight: 16 },
  { item: { kind: 'mul', n: 3 }, weight: 6 },
  { item: { kind: 'mul', n: 4 }, weight: 2 },
  { item: { kind: 'mul', n: 5 }, weight: 1 },
];
export const AVIA_WEIGHT_TOTAL = AVIA_ITEMS.reduce((sum, i) => sum + i.weight, 0);

/** Multiplier after meeting one item (two decimals, never above the cap). */
export function aviaApply(multiplier: number, item: AviaItem) {
  let m = multiplier;
  if (item.kind === 'add') m = multiplier + item.n;
  else if (item.kind === 'mul') m = multiplier * item.n;
  else if (item.kind === 'rocket') m = Math.floor(multiplier * 50) / 100;
  return Math.min(AVIA_MAX, Math.round(m * 100) / 100);
}

/** The item for a draw `roll` in [0, AVIA_WEIGHT_TOTAL). */
export function aviaItemAt(roll: number) {
  let left = roll;
  for (const { item, weight } of AVIA_ITEMS) {
    if (left < weight) return item;
    left -= weight;
  }
  return AVIA_ITEMS[0].item;
}

export type AviaFlight = { items: AviaItem[]; steps: number[]; multiplier: number; landed: boolean };

/** One whole round. `randInt(n)` must give a fair integer in [0, n). */
export function aviaFlight(randInt: (max: number) => number): AviaFlight {
  const items: AviaItem[] = [];
  const steps: number[] = [];
  let m = AVIA_START;
  for (let i = 0; i < AVIA_SLOTS; i++) {
    const item = aviaItemAt(randInt(AVIA_WEIGHT_TOTAL));
    m = aviaApply(m, item);
    items.push(item);
    steps.push(m);
  }
  // 10 000 steps give the landing chance four decimals.
  return { items, steps, multiplier: m, landed: randInt(10_000) < AVIA_LAND * 10_000 };
}

export const aviaPayout = (stake: number, flight: Pick<AviaFlight, 'multiplier' | 'landed'>) => (flight.landed ? Math.floor(stake * flight.multiplier) : 0);

/** Text on the board for an item ("+5", "×2", "🚀" is drawn as an icon by the UI). */
export const aviaLabel = (item: AviaItem) => (item.kind === 'add' ? `+${item.n}` : item.kind === 'mul' ? `×${item.n}` : '');
