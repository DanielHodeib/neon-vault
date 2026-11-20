export type Cell = [number, number];

export type Win = { symbol: string; count: number; cells: Cell[]; amount: number; line?: number; ways?: number };

export type Step = { grid: string[][]; wins: Win[]; mult: number; reveal?: Cell[] };

export type FreeSpins = { machine: string; spins: number; bet: number; special: string | null } | null;

export type Result = {
  steps: Step[];
  multiplier: number;
  features: string[];
  freeWon: number;
  freeSpins: FreeSpins;
  win: number;
  bet: number;
  free: boolean;
  special?: string;
  chaos?: number;
  expand?: { symbol: string; cols: number[]; amount: number };
};

export type Phase = 'idle' | 'spinning' | 'showing';

export const STRIP = 10;

export const LINE_COLORS = ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#facc15', '#e879f9'];

export const cellKey = ([c, r]: Cell) => `${c}:${r}`;
