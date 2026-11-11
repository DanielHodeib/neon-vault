// Pure game data shared by the server engines and the browser UI.

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

/** Crash curve; identical on server and client. */
export const multiplierAt = (ms: number) => Math.floor(100 * Math.exp(0.00006 * ms)) / 100;

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
