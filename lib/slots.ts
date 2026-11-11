// Slot machines: pure data shared by the server engine (game/slots.ts) and the browser UI.
// Every machine has its own grid, symbols, pay table and feature. Pay values:
// lines mode = × line bet (stake / lines), ways mode = × stake / `waysDivisor` per way,
// scatter = × total stake. RTP of each machine is pinned by game/engines.test.ts.

export type Sym = {
  icon: string;
  weight: number; // relative chance per cell
  pays?: Partial<Record<2 | 3 | 4 | 5, number>>;
  wild?: boolean; // substitutes every symbol except scatters
  scatter?: boolean; // pays anywhere, triggers free spins
  mystery?: boolean; // all mystery cells reveal the same symbol
};

export type Machine = {
  name: string;
  tagline: string;
  feature: string; // one-line rule shown in the UI
  colors: [string, string]; // frame gradient
  /** Measured over 3M simulated spins (rtp/hit in %, feature = 1 in N spins); game/engines.test.ts keeps them honest. */
  odds: { rtp: number; hit: number; feature?: number };
  minBet: number;
  spinMs: number;
  cols: number;
  rows: number;
  lines?: number[][]; // row index per column; absent = ways (all adjacent reels)
  waysDivisor?: number;
  symbols: Sym[];
  wildMult?: number; // each wild in a winning line multiplies it
  chaos?: [number, number][]; // [multiplier, weight] applied to every winning spin
  tumble?: number[]; // winning symbols vanish, new ones fall in; multiplier per cascade
  freeSpins?: { spins: Partial<Record<number, number>>; mult?: number; expanding?: boolean };
};

const LINES_3 = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const LINES_5 = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
];

export const MACHINES: Record<string, Machine> = {
  classic: {
    name: 'Classic 777',
    tagline: 'Der Einarmige Bandit',
    feature: 'Kirschen zahlen schon ab zwei.',
    colors: ['#7f1d1d', '#1c1917'],
    odds: { rtp: 96.9, hit: 37.9 },
    minBet: 10, spinMs: 1200, cols: 3, rows: 3, lines: LINES_3,
    symbols: [
      { icon: '🍒', weight: 30, pays: { 2: 1.5, 3: 10 } },
      { icon: '🍋', weight: 26, pays: { 3: 20 } },
      { icon: '🍊', weight: 22, pays: { 3: 25 } },
      { icon: '🍇', weight: 16, pays: { 3: 40 } },
      { icon: '🔔', weight: 10, pays: { 3: 75 } },
      { icon: '7️⃣', weight: 5, pays: { 3: 200 } },
    ],
  },
  turbo: {
    name: 'Turbo Fruits',
    tagline: 'Schnell, bunt, Blitz-Wilds',
    feature: '⚡ ersetzt alles und verdoppelt jede Gewinnlinie, auf der er liegt.',
    colors: ['#065f46', '#0c1a17'],
    odds: { rtp: 93.7, hit: 35.5 },
    minBet: 10, spinMs: 500, cols: 3, rows: 3, lines: LINES_3, wildMult: 2,
    symbols: [
      { icon: '🍓', weight: 30, pays: { 3: 4 } },
      { icon: '🍉', weight: 25, pays: { 3: 6 } },
      { icon: '🍍', weight: 20, pays: { 3: 8 } },
      { icon: '🥝', weight: 14, pays: { 3: 12 } },
      { icon: '🍀', weight: 8, pays: { 3: 25 } },
      { icon: '⚡', weight: 5, wild: true, pays: { 3: 60 } },
    ],
  },
  highroller: {
    name: 'High Roller',
    tagline: 'Wenig Treffer, riesige Gewinne',
    feature: 'Hohe Volatilität: 💎💎💎 zahlt das 750-fache des Linieneinsatzes.',
    colors: ['#713f12', '#14110b'],
    odds: { rtp: 97.5, hit: 39.1 },
    minBet: 500, spinMs: 1400, cols: 3, rows: 3, lines: LINES_3,
    symbols: [
      { icon: '💵', weight: 30, pays: { 3: 5 } },
      { icon: '💰', weight: 20, pays: { 3: 12 } },
      { icon: '🏆', weight: 12, pays: { 3: 40 } },
      { icon: '👑', weight: 7, pays: { 3: 125 } },
      { icon: '💎', weight: 3, pays: { 3: 750 } },
    ],
  },
  chaos: {
    name: 'Chaos Reels',
    tagline: 'Jeder Gewinn ein Würfelwurf',
    feature: 'Jeder Gewinn bekommt einen Chaos-Multiplikator von ×1 bis ×10.',
    colors: ['#581c87', '#140b1c'],
    odds: { rtp: 93.9, hit: 47.5 },
    minBet: 25, spinMs: 1300, cols: 5, rows: 3, lines: LINES_5,
    chaos: [[1, 50], [2, 25], [3, 12], [5, 8], [10, 5]],
    symbols: [
      { icon: '🧪', weight: 30, pays: { 3: 1.5, 4: 5, 5: 15 } },
      { icon: '🌀', weight: 26, pays: { 3: 2.5, 4: 7, 5: 25 } },
      { icon: '☄️', weight: 20, pays: { 3: 4, 4: 12, 5: 40 } },
      { icon: '👾', weight: 14, pays: { 3: 7, 4: 20, 5: 80 } },
      { icon: '🔮', weight: 8, pays: { 3: 12, 4: 50, 5: 250 } },
      { icon: '🃏', weight: 3, wild: true },
    ],
  },
  freespins: {
    name: 'Lucky Gifts',
    tagline: 'Geschenke bringen Freispiele',
    feature: '3+ 🎁 irgendwo = 8 / 12 / 20 Free Spins, alle Gewinne darin ×2.',
    colors: ['#9d174d', '#1c0b14'],
    odds: { rtp: 97, hit: 56.8, feature: 48 },
    minBet: 20, spinMs: 1300, cols: 5, rows: 3, lines: LINES_5,
    freeSpins: { spins: { 3: 8, 4: 12, 5: 20 }, mult: 2 },
    symbols: [
      { icon: '🍬', weight: 30, pays: { 3: 2, 4: 5, 5: 15 } },
      { icon: '🧁', weight: 26, pays: { 3: 3, 4: 8, 5: 25 } },
      { icon: '🍭', weight: 20, pays: { 3: 5, 4: 12, 5: 40 } },
      { icon: '🎈', weight: 14, pays: { 3: 8, 4: 20, 5: 80 } },
      { icon: '🌟', weight: 5, wild: true, pays: { 3: 20, 4: 80, 5: 400 } },
      { icon: '🎁', weight: 4, scatter: true, pays: { 3: 2, 4: 10, 5: 50 } },
    ],
  },
  bookofra: {
    name: 'Buch des Anubis',
    tagline: 'Das Buch ist Wild und Scatter',
    feature: '3+ 📖 = 10 Free Spins mit einem Sondersymbol, das sich über ganze Walzen ausbreitet.',
    colors: ['#78350f', '#17110a'],
    odds: { rtp: 98.3, hit: 51.9, feature: 155 },
    minBet: 50, spinMs: 1600, cols: 5, rows: 3, lines: LINES_5,
    freeSpins: { spins: { 3: 10, 4: 10, 5: 10 }, expanding: true },
    symbols: [
      { icon: '🏺', weight: 30, pays: { 3: 1.5, 4: 5, 5: 25 } },
      { icon: '🪲', weight: 26, pays: { 3: 2, 4: 8, 5: 40 } },
      { icon: '🐍', weight: 18, pays: { 3: 5, 4: 20, 5: 100 } },
      { icon: '🦅', weight: 12, pays: { 3: 10, 4: 40, 5: 200 } },
      { icon: '👑', weight: 7, pays: { 2: 1, 3: 15, 4: 80, 5: 400 } },
      { icon: '📖', weight: 2.5, wild: true, scatter: true, pays: { 3: 2, 4: 10, 5: 100 } },
    ],
  },
  luxor: {
    name: 'Luxor Kaskaden',
    tagline: 'Gewinne fallen nach',
    feature: 'Gewinnsymbole verschwinden, neue fallen nach – jede Kaskade erhöht den Multiplikator (×1, ×2, ×3, ×5).',
    colors: ['#1e3a8a', '#0b1020'],
    odds: { rtp: 97, hit: 47.5 },
    minBet: 40, spinMs: 1400, cols: 5, rows: 3, lines: LINES_5, tumble: [1, 2, 3, 5],
    symbols: [
      { icon: '🔷', weight: 30, pays: { 3: 2, 4: 5, 5: 15 } },
      { icon: '💚', weight: 26, pays: { 3: 3, 4: 8, 5: 25 } },
      { icon: '🔶', weight: 20, pays: { 3: 4, 4: 12, 5: 40 } },
      { icon: '💜', weight: 14, pays: { 3: 6, 4: 20, 5: 80 } },
      { icon: '🔺', weight: 8, pays: { 3: 10, 4: 40, 5: 200 } },
      { icon: '☀️', weight: 3, wild: true },
    ],
  },
  treasurehunt: {
    name: 'Schatzjagd',
    tagline: '243 Wege, Mystery-Truhen',
    feature: 'Gewinnt in jeder Reihe von links nach rechts. Alle ❓ werden zum selben Symbol.',
    colors: ['#164e63', '#0a1416'],
    odds: { rtp: 95.6, hit: 60.6 },
    minBet: 75, spinMs: 1800, cols: 5, rows: 3, waysDivisor: 25,
    symbols: [
      { icon: '⚓', weight: 30, pays: { 3: 1.5, 4: 3.5, 5: 10 } },
      { icon: '🧭', weight: 26, pays: { 3: 2, 4: 6, 5: 20 } },
      { icon: '🦜', weight: 20, pays: { 3: 3.5, 4: 10, 5: 35 } },
      { icon: '🗡️', weight: 14, pays: { 3: 6, 4: 20, 5: 70 } },
      { icon: '💰', weight: 8, pays: { 3: 10, 4: 45, 5: 200 } },
      { icon: '❓', weight: 6, mystery: true },
    ],
  },
};

/** Number of paylines, or the full ways count for ways machines. */
export const lineCount = (m: Machine) => m.lines?.length ?? m.rows ** m.cols;

/** The highest-paying regular symbol; Jackpot-Rush pays it triple. */
export const topSymbol = (m: Machine) =>
  m.symbols.filter((s) => !s.scatter && !s.mystery && s.pays).sort((a, b) => Math.max(...Object.values(b.pays!)) - Math.max(...Object.values(a.pays!)))[0].icon;

/** Highest possible win of one spin, × stake. */
export const SLOT_MAX_WIN = 5000;

export const BIG_WIN = [[50, 'Epic Win'], [25, 'Mega Win'], [10, 'Big Win']] as const;
