import { MACHINES, SLOT_MAX_WIN, topSymbol, type Machine, type Sym } from '@/lib/slots';
import { pick, rand } from './rng';

export { MACHINES };

type Cell = [col: number, row: number];
export type Win = { symbol: string; count: number; cells: Cell[]; amount: number; line?: number; ways?: number };
/** One evaluated grid; tumbling machines produce several in a row. */
export type Step = { grid: string[][]; wins: Win[]; mult: number; reveal?: Cell[] };
export type SpinResult = {
  steps: Step[];
  multiplier: number; // total win ÷ stake
  features: string[];
  freeSpins: number; // spins won (scatter)
  special?: string; // expanding symbol picked for a new free spin round
  chaos?: number;
  expand?: { symbol: string; cols: number[]; amount: number };
};

const MAX_TUMBLES = 20;

function draw(m: Machine, pool = m.symbols): Sym {
  let roll = rand() * pool.reduce((s, x) => s + x.weight, 0);
  for (const s of pool) if ((roll -= s.weight) < 0) return s;
  return pool.at(-1)!;
}

const bySymbol = (m: Machine) => new Map(m.symbols.map((s) => [s.icon, s]));
const newColumn = (m: Machine) => Array.from({ length: m.rows }, () => draw(m).icon);

/** Line or ways wins of one grid, as multiples of the stake. */
function evaluate(m: Machine, grid: string[][], rush: number): Win[] {
  const sym = bySymbol(m);
  const top = topSymbol(m);
  const isWild = (icon: string) => !!sym.get(icon)?.wild;
  const payOf = (s: Sym, count: number) => (s.pays?.[count as 2] ?? 0) * (s.icon === top ? rush : 1);
  const wins: Win[] = [];

  if (m.lines) {
    m.lines.forEach((line, li) => {
      const cells = line.map((row, col): Cell => [col, row]);
      const icons = cells.map(([c, r]) => grid[c][r]);
      // A line pays for its first regular symbol; wilds join in. Pure wild lines pay as the wild.
      const base = sym.get(icons.find((i) => !isWild(i)) ?? icons[0])!;
      if (base.scatter) return;
      let count = 0;
      while (count < icons.length && (icons[count] === base.icon || (isWild(icons[count]) && !base.scatter))) count++;
      const pay = payOf(base, count);
      if (!pay) return;
      const wilds = icons.slice(0, count).filter((i) => isWild(i) && i !== base.icon).length;
      const mult = m.wildMult ? m.wildMult ** wilds : 1;
      wins.push({ symbol: base.icon, count, cells: cells.slice(0, count), amount: (pay * mult) / m.lines!.length, line: li });
    });
    return wins;
  }

  // Ways: a symbol pays for every combination across adjacent reels from the left.
  for (const s of m.symbols) {
    if (s.wild || s.scatter || s.mystery || !s.pays) continue;
    const cells: Cell[] = [];
    let ways = 1;
    let count = 0;
    for (let c = 0; c < m.cols; c++) {
      const hits = grid[c].flatMap((icon, r): Cell[] => (icon === s.icon || isWild(icon) ? [[c, r]] : []));
      if (!hits.length) break;
      cells.push(...hits);
      ways *= hits.length;
      count++;
    }
    const pay = payOf(s, count);
    if (pay) wins.push({ symbol: s.icon, count, cells, amount: (pay * ways) / m.waysDivisor!, ways });
  }
  return wins;
}

const sum = (wins: Win[]) => wins.reduce((s, w) => s + w.amount, 0);

/**
 * One spin. `free` marks a free spin (machine bonus applies), `special` is the expanding symbol of
 * the running free spin round, `rush` (Jackpot-Rush event) multiplies what the top symbol pays.
 */
export function spin(m: Machine, { free = false, special, rush = 1 }: { free?: boolean; special?: string; rush?: number } = {}): SpinResult {
  const features: string[] = [];
  const sym = bySymbol(m);
  let grid = Array.from({ length: m.cols }, () => newColumn(m));

  // Mystery cells all turn into the same regular symbol.
  const reveal = grid.flatMap((col, c) => col.flatMap((icon, r): Cell[] => (sym.get(icon)?.mystery ? [[c, r]] : [])));
  if (reveal.length) {
    const into = draw(m, m.symbols.filter((s) => !s.mystery && !s.scatter && !s.wild)).icon;
    for (const [c, r] of reveal) grid[c][r] = into;
    if (reveal.length > 1) features.push('mystery');
  }

  // Scatters count on the first grid only.
  const scatter = m.symbols.find((s) => s.scatter);
  const scatters = scatter ? grid.flat().filter((i) => i === scatter.icon).length : 0;
  const scatterPay = scatter ? (scatter.pays?.[scatters as 2] ?? 0) : 0;
  const freeSpins = m.freeSpins?.spins[scatters] ?? 0;

  const steps: Step[] = [];
  for (let i = 0; i < MAX_TUMBLES; i++) {
    const wins = evaluate(m, grid, rush);
    const mult = m.tumble ? m.tumble[Math.min(i, m.tumble.length - 1)] : 1;
    steps.push({ grid: grid.map((col) => [...col]), wins, mult, ...(i === 0 && reveal.length ? { reveal } : {}) });
    if (!m.tumble || !wins.length) break;
    // Winning cells vanish; the rest fall down and new symbols drop in from the top.
    const gone = new Set(wins.flatMap((w) => w.cells.map(([c, r]) => `${c}:${r}`)));
    grid = grid.map((col, c) => {
      const kept = col.filter((_, r) => !gone.has(`${c}:${r}`));
      return [...Array.from({ length: m.rows - kept.length }, () => draw(m).icon), ...kept];
    });
  }
  if (steps.length > 1) features.push('tumble');

  let total = steps.reduce((s, st) => s + sum(st.wins) * st.mult, 0) + scatterPay;

  // Free spin round of an expanding machine: the special symbol fills every reel it lands on.
  let expand: SpinResult['expand'];
  if (free && special && m.freeSpins?.expanding) {
    const s = sym.get(special);
    const cols = grid.flatMap((col, c) => (col.includes(special) ? [c] : []));
    const pay = s ? (s.pays?.[cols.length as 2] ?? 0) : 0;
    if (pay) {
      expand = { symbol: special, cols, amount: pay };
      total += pay;
      features.push('expand');
    }
  }

  let chaos: number | undefined;
  if (total > 0 && m.chaos) {
    let roll = rand() * m.chaos.reduce((s, [, w]) => s + w, 0);
    chaos = m.chaos.find(([, w]) => (roll -= w) < 0)?.[0] ?? 1;
    total *= chaos;
    if (chaos > 1) features.push('chaos');
  }
  if (free && m.freeSpins?.mult) total *= m.freeSpins.mult;
  if (freeSpins) features.push('freespins');

  // New free spin round on an expanding machine: pick its special symbol.
  const newSpecial = freeSpins && m.freeSpins?.expanding && !special ? pickSpecial(m) : undefined;

  return {
    steps,
    multiplier: Math.round(Math.min(total, SLOT_MAX_WIN) * 10_000) / 10_000,
    features,
    freeSpins,
    ...(newSpecial ? { special: newSpecial } : {}),
    ...(chaos ? { chaos } : {}),
    ...(expand ? { expand } : {}),
  };
}

/** Expanding symbol for a free spin round: any regular symbol. */
export const pickSpecial = (m: Machine) => pick(m.symbols.filter((s) => !s.wild && !s.scatter && !s.mystery)).icon;
