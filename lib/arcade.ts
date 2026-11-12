// Pure data for the arcade games (scratch card, tower, keno, video poker), shared by server and browser.
// Every table is checked for its payout rate in game/arcade.test.ts.

// ── Rubbellos (scratch card): 3×3 fields, three equal symbols win ────────────────────────────────
/** Prize per symbol (× stake) and its chance per card. Expected return 98 %. */
export const SCRATCH_PRIZES = [
  { symbol: '💎', multiplier: 100, chance: 0.002 },
  { symbol: '7️⃣', multiplier: 20, chance: 0.01 },
  { symbol: '🍀', multiplier: 5, chance: 0.04 },
  { symbol: '🍒', multiplier: 2, chance: 0.1 },
  { symbol: '🔔', multiplier: 1, chance: 0.18 },
] as const;
export const SCRATCH_FIELDS = 9;

// ── Tower: climb floors, one door per floor hides a trap ─────────────────────────────────────────
export type TowerRisk = 'easy' | 'medium' | 'hard';
export const TOWER_FLOORS = 8;
/** Doors per floor; exactly one is a trap. */
export const TOWER_DOORS: Record<TowerRisk, number> = { easy: 4, medium: 3, hard: 2 };
export const TOWER_RISK_LABEL: Record<TowerRisk, string> = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
/** Cash-out multiplier after `floors` safe floors (3 % house edge). */
export function towerMultiplier(risk: TowerRisk, floors: number) {
  if (floors === 0) return 1;
  const safe = (TOWER_DOORS[risk] - 1) / TOWER_DOORS[risk];
  return Math.floor((0.97 / safe ** floors) * 100) / 100;
}

// ── Keno: 40 numbers, pick 1–10, the house draws 10 ──────────────────────────────────────────────
export const KENO_NUMBERS = 40;
export const KENO_DRAWN = 10;
export const KENO_MAX_PICKS = 10;
/** KENO_PAYS[picks][hits] = × stake. Every row returns 94–97 %. */
export const KENO_PAYS: Record<number, Record<number, number>> = {
  1: { 1: 3.8 },
  2: { 1: 1.1, 2: 9.5 },
  3: { 2: 4, 3: 35 },
  4: { 2: 2, 3: 8, 4: 95 },
  5: { 2: 1.3, 3: 4, 4: 20, 5: 250 },
  6: { 3: 3.5, 4: 12, 5: 90, 6: 900 },
  7: { 3: 2.3, 4: 6.5, 5: 25, 6: 250, 7: 1500 },
  8: { 3: 1.5, 4: 4, 5: 15, 6: 75, 7: 600, 8: 3000 },
  9: { 4: 4.5, 5: 11, 6: 45, 7: 250, 8: 1800, 9: 9000 },
  10: { 4: 3.2, 5: 6.5, 6: 20, 7: 110, 8: 650, 9: 3000, 10: 11000 },
};

// ── Video Poker (Jacks or Better): deal five, hold any, draw once ────────────────────────────────
/** Hands that pay, best first; `key` comes from evaluateVideoPoker on the server. */
export const VIDEO_POKER_PAYS = [
  { key: 'royal', name: 'Royal Flush', multiplier: 250 },
  { key: 'straightFlush', name: 'Straight Flush', multiplier: 50 },
  { key: 'quads', name: 'Vierling', multiplier: 25 },
  { key: 'fullHouse', name: 'Full House', multiplier: 9 },
  { key: 'flush', name: 'Flush', multiplier: 6 },
  { key: 'straight', name: 'Straße', multiplier: 4 },
  { key: 'trips', name: 'Drilling', multiplier: 3 },
  { key: 'twoPair', name: 'Zwei Paare', multiplier: 2 },
  { key: 'jacks', name: 'Bube oder besser', multiplier: 1 },
] as const;
export type VideoPokerHand = (typeof VIDEO_POKER_PAYS)[number]['key'];
