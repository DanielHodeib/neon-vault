// Pure data for Wheel of Fortune and Jackpot, shared by server and browser.

// 2×/3×/5×/50× cannot all return 95–100 % on 30 segments (50× on one segment alone pays 167 %),
// so the multipliers are tuned to the counts: return = multiplier × count / 30.
export const WHEEL_OPTIONS = [
  { multiplier: 2, count: 15, color: '#3f4a5c' }, // 100 %
  { multiplier: 3.3, count: 9, color: '#2f7fd1' }, // 99 %
  { multiplier: 6, count: 5, color: '#8b5cf6' }, // 100 %
  { multiplier: 30, count: 1, color: '#e4c06a' }, // 100 %
] as const;

export type WheelMultiplier = (typeof WHEEL_OPTIONS)[number]['multiplier'];
export const WHEEL_MULTIPLIERS: readonly number[] = WHEEL_OPTIONS.map((o) => o.multiplier);

// Clockwise from the top: 2× on every odd slot, the rest spread over the even slots.
const EVEN = [30, 3.3, 6, 3.3, 3.3, 6, 3.3, 3.3, 6, 3.3, 3.3, 6, 3.3, 6, 3.3] as const;
export const WHEEL_SEGMENTS: readonly WheelMultiplier[] = EVEN.flatMap((m) => [m, 2 as const]);

export const wheelColor = (m: number) => WHEEL_OPTIONS.find((o) => o.multiplier === m)?.color ?? '#23272e';

export const WHEEL_BET_MS = 15_000;
export const WHEEL_SPIN_MS = 6_000;
export const WHEEL_RESULT_MS = 4_000;

export const JACKPOT_FEE = 0.03;
export const JACKPOT_ROUND_MS = 60_000;
export const JACKPOT_CLOSE_MS = 2_000; // deposits close this long before the draw
export const JACKPOT_DRAW_MS = 5_000;

// Show bonus: the golden 30× segment opens a second wheel for the 30× bets. Its weighted average
// is exactly 30×, so the bonus adds excitement, not house edge or player edge.
export const WHEEL_BONUS_TRIGGER = 30;
export const WHEEL_BONUS = [
  { multiplier: 10, weight: 7, color: '#3f4a5c' },
  { multiplier: 15, weight: 6, color: '#2f7fd1' },
  { multiplier: 20, weight: 5, color: '#8b5cf6' },
  { multiplier: 30, weight: 3, color: '#ec4899' },
  { multiplier: 50, weight: 2, color: '#f97316' },
  { multiplier: 100, weight: 1, color: '#e4c06a' },
  { multiplier: 200, weight: 1, color: '#fde047' },
] as const;
/** Bonus wheel segments, one per weight unit, interleaved so equal values don't clump. */
export const WHEEL_BONUS_SEGMENTS: readonly number[] = (() => {
  const pool = WHEEL_BONUS.flatMap((b) => Array<number>(b.weight).fill(b.multiplier));
  const out: number[] = [];
  for (let i = 0; i < pool.length; i++) out.push(pool[(i * 7) % pool.length]); // 7 is coprime with 25: a fixed shuffle
  return out;
})();
export const WHEEL_BONUS_MS = 6_000;
export const bonusColor = (m: number) => WHEEL_BONUS.find((b) => b.multiplier === m)?.color ?? '#23272e';
