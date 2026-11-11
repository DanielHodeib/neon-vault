import { MACHINES, type Machine } from '@/lib/games';
import { pick, rand } from './rng';

export { MACHINES };

export type SpinResult = { reels: string[]; multiplier: number; features: string[]; freeSpins: number };

/** Outcome first (fixed odds), then reels drawn to show it. */
/** `rush` (Jackpot-Rush event) triples the chance of the top tier. */
export function spin(m: Machine, rush = false): SpinResult {
  const features: string[] = [];
  const top = m.symbols.at(-1)!;
  let multiplier = 0;
  let count = 0;
  let symbol = '';
  let freeSpins = 0;

  let roll = rand();
  if (m.expand && (roll -= m.expand.p) < 0) {
    features.push('expand');
    return { reels: Array(m.reels).fill(top), multiplier: m.expand.mult, features, freeSpins };
  }
  if (m.scatter && (roll -= m.scatter.p) < 0) {
    features.push('freespins');
    freeSpins = m.scatter.spins;
    return { reels: [...Array(m.reels - 1).fill('💎'), '🎁'], multiplier: 0, features, freeSpins };
  }
  for (const [i, tier] of m.tiers.entries()) {
    if ((roll -= rush && i === m.tiers.length - 1 ? tier.p * 3 : tier.p) < 0) {
      multiplier = tier.mult;
      count = tier.count;
      // The last tier of fruit machines is the jackpot; it shows the top symbol.
      symbol = i === m.tiers.length - 1 && tier.count === m.reels ? top : pick(m.symbols.slice(0, -1));
      break;
    }
  }

  if (multiplier > 0 && m.cascade && rand() < m.cascade.p) {
    multiplier *= 1 + m.cascade.boost;
    features.push('cascade');
  }
  if (multiplier > 0 && m.chaos) {
    const [lo, hi] = m.chaos;
    multiplier *= lo + rand() * (hi - lo);
    features.push('chaos');
  }

  const reels: string[] = [];
  for (let i = 0; i < m.reels; i++) {
    if (i < count) reels.push(symbol);
    else if (i === count || (count === 0 && i === 1)) reels.push(pick(m.symbols.filter((s) => s !== reels[i - 1])));
    else reels.push(pick(m.symbols));
  }
  return { reels, multiplier: Math.round(multiplier * 100) / 100, features, freeSpins };
}
