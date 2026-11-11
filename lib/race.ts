// Horse race: pure data shared by server (game/race.ts) and browser.
export const HORSES = [
  { name: 'Blitz', color: '#f87171' },
  { name: 'Komet', color: '#60a5fa' },
  { name: 'Nebel', color: '#a78bfa' },
  { name: 'Donner', color: '#fbbf24' },
  { name: 'Funke', color: '#34d399' },
  { name: 'Schatten', color: '#e5e7eb' },
] as const;

export const RACE_BET_MS = 20_000;
export const RACE_RUN_MS = 9_000;
export const RACE_RESULT_MS = 6_000;
const RETURN = 0.95; // 5 % house edge on every horse

/** Payout multiplier (stake included) for a horse with this win chance. */
export const raceOdds = (chance: number) => Math.floor((RETURN / chance) * 100) / 100;

/**
 * Track position 0..1 of a horse at `t` ms into the race. Every horse reaches the line
 * exactly at its finish time; the wobble only changes the pace on the way.
 */
export function racePosition(t: number, finish: number, seed: number) {
  const x = Math.min(1, Math.max(0, t / finish));
  return Math.min(1, x + 0.04 * Math.sin(x * Math.PI * (2 + (seed % 3))) * Math.sin(x * Math.PI));
}
