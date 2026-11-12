// Pure game data shared by the server engines and the browser UI.

/** Solo coinflip against the house pays 1.96× (2 % edge). Events don't boost it, so it can't be farmed. */
export const COINFLIP_SOLO_PAYOUT = 1.96;

/** Crash curve; identical on server and client. */
export const multiplierAt = (ms: number) => Math.floor(100 * Math.exp(0.00006 * ms)) / 100;

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** Daily spin wheel, clockwise from the top. Weights are relative; expected base ≈ 3.8k NVC. */
export const DAILY_SEGMENTS = [
  { value: 1_000, weight: 40 },
  { value: 2_500, weight: 36 },
  { value: 5_000, weight: 28 },
  { value: 1_000, weight: 40 },
  { value: 7_500, weight: 16 },
  { value: 2_500, weight: 36 },
  { value: 10_000, weight: 10 },
  { value: 5_000, weight: 28 },
  { value: 25_000, weight: 4 },
  { value: 2_500, weight: 36 },
  { value: 50_000, weight: 1 },
  { value: 5_000, weight: 28 },
];

/** +10 % per consecutive day, capped at ×1.9 from day 10. */
export const streakMultiplier = (streak: number) => 1 + Math.min(Math.max(streak, 1) - 1, 9) / 10;

/** Live ticker: wins from this size (one round) show up; from CELEBRATE_MIN everyone gets the full-screen moment. */
export const TICKER_MIN = 5_000;
export const CELEBRATE_MIN = 100_000;
