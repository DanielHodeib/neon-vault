// Pure math for the single-player games (Mines, Dice, Plinko); shared by server and browser.

export const MINES_TILES = 25;
export const MINES_MIN = 1;
export const MINES_MAX = 24;

/** 0.99 / P(`revealed` safe tiles in a row), floored to 2 decimals. 1 before the first reveal. */
export function minesMultiplier(mines: number, revealed: number) {
  let p = 1;
  for (let i = 0; i < revealed; i++) p *= (MINES_TILES - mines - i) / (MINES_TILES - i);
  // Epsilon guards against float results like 1.9799999 flooring a cent too low.
  return revealed ? Math.floor((99 / p) + 1e-9) / 100 : 1;
}

export const DICE_MIN = 1;
export const DICE_MAX = 98;
export type DiceSide = 'under' | 'over';

export const diceChance = (target: number, side: DiceSide) => (side === 'under' ? target : 100 - target);
/** 1 % house edge. */
export const diceMultiplier = (chance: number) => Math.floor(9900 / chance) / 100;

export const PLINKO_ROWS = 12;
export type PlinkoRisk = 'low' | 'medium' | 'high';

const mirror = (half: number[]) => [...half, ...half.slice(0, -1).reverse()];

/** 13 slots each, symmetric; RTP 97–99 % (verified by game/solo.test.ts). */
export const PLINKO: Record<PlinkoRisk, number[]> = {
  low: mirror([10, 3, 1.5, 1.4, 1.1, 1, 0.5]),
  medium: mirror([32, 11, 4, 2, 1.1, 0.6, 0.3]),
  high: mirror([170, 24, 8, 2, 0.7, 0.2, 0.2]),
};

export const PLINKO_RISK_LABEL: Record<PlinkoRisk, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };

// Hi-Lo: cards are drawn with replacement, ties count for the player ("higher or same").
export const HILO_MAX = 5000; // × stake
export const HILO_SKIPS = 3; // free card swaps per round
export type HiloGuess = 'higher' | 'lower';
/** Chance that the next card (value 2..14) is higher-or-same / lower-or-same. */
export const hiloChance = (value: number, guess: HiloGuess) => (guess === 'higher' ? 15 - value : value - 1) / 13;
/** Step multiplier for a guess, 2 % house edge, floored to 2 decimals. */
export const hiloStep = (chance: number) => Math.floor(98 / chance) / 100;
