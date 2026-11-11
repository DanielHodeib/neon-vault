import { pick, rand } from './rng';

const FRUITS = ['🍒', '🍋', '🍇', '💎', '7️⃣'];
const EGYPT = ['🏺', '🦅', '👑', '🏛️', '📖'];

type Tier = { p: number; count: number; mult: number };
export type Machine = {
  name: string;
  reels: number;
  minBet: number;
  spinMs: number;
  symbols: string[];
  tiers: Tier[]; // `count` matching symbols from the left
  expand?: { p: number; mult: number }; // all reels turn into the book symbol
  scatter?: { p: number; spins: number }; // free spins
  cascade?: { p: number; boost: number }; // extra win on top of a win
  chaos?: [number, number]; // random multiplier on wins
};

const fruit = (minBet: number, spinMs: number, pair: number, triple: number, jackpot: [number, number]): Omit<Machine, 'name'> => ({
  reels: 3,
  minBet,
  spinMs,
  symbols: FRUITS,
  tiers: [
    { p: 0.22, count: 2, mult: pair },
    { p: 0.07, count: 3, mult: triple },
    { p: jackpot[0], count: 3, mult: jackpot[1] },
  ],
});

// Target RTP ~92–96 %; verified by engines.test.ts.
export const MACHINES: Record<string, Machine> = {
  classic: { name: 'Classic', ...fruit(10, 1400, 1.5, 6, [0.004, 50]) },
  turbo: { name: 'Turbo', ...fruit(10, 600, 1.5, 6, [0.004, 50]) },
  highroller: { name: 'High Roller', ...fruit(500, 1300, 1.2, 7, [0.002, 100]) },
  chaos: { name: 'Chaos', ...fruit(25, 1100, 1.5, 6, [0.004, 50]), chaos: [0.5, 1.5] },
  freespins: { name: 'Free Spins', ...fruit(20, 1300, 1.4, 6, [0.004, 40]), scatter: { p: 0.01, spins: 5 } },
  bookofra: {
    name: 'Book of Ra', reels: 5, minBet: 50, spinMs: 1800, symbols: EGYPT,
    tiers: [{ p: 0.12, count: 3, mult: 2 }, { p: 0.04, count: 4, mult: 6 }, { p: 0.008, count: 5, mult: 30 }],
    expand: { p: 0.02, mult: 10 },
  },
  luxor: {
    name: 'Luxor', reels: 4, minBet: 40, spinMs: 1600, symbols: EGYPT,
    tiers: [{ p: 0.2, count: 3, mult: 2.2 }, { p: 0.035, count: 4, mult: 12 }],
    cascade: { p: 0.2, boost: 0.5 },
  },
  treasurehunt: {
    name: 'Treasure Hunt', reels: 5, minBet: 75, spinMs: 2000, symbols: EGYPT,
    tiers: [{ p: 0.12, count: 3, mult: 2 }, { p: 0.04, count: 4, mult: 6 }, { p: 0.006, count: 5, mult: 40 }],
    expand: { p: 0.015, mult: 10 },
    cascade: { p: 0.2, boost: 0.5 },
  },
};

export type SpinResult = { reels: string[]; multiplier: number; features: string[]; freeSpins: number };

/** Outcome first (fixed odds), then reels drawn to show it. */
export function spin(m: Machine): SpinResult {
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
    if ((roll -= tier.p) < 0) {
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
