// Friendly bets ("Wetten"): pure rules shared by the actions, the page and the tests.

export const MARKET_FEE = 0.03; // taken from the pot when a bet is settled
export const MARKET_MIN_BET = 10;
export const MARKET_MAX_OPEN = 3; // open markets per creator
export const MARKET_MIN_MINUTES = 5;
export const MARKET_MAX_DAYS = 7;

export type MarketOption = 'A' | 'B';
type Bet = { id: string; option: MarketOption; amount: number };

/** Pot split after a settle: winners share the pot minus the fee, in proportion to their stake,
 *  and never get less than their own stake back. No winners → everybody gets their stake back. */
export function marketPayouts(bets: Bet[], outcome: MarketOption) {
  const pot = bets.reduce((s, b) => s + b.amount, 0);
  const winPool = bets.filter((b) => b.option === outcome).reduce((s, b) => s + b.amount, 0);
  if (winPool === 0) return new Map(bets.map((b) => [b.id, { amount: b.amount, refund: true }]));
  return new Map(
    bets.map((b) => [b.id, b.option === outcome ? { amount: Math.max(b.amount, Math.floor((pot * (1 - MARKET_FEE) * b.amount) / winPool)), refund: false } : { amount: 0, refund: false }]),
  );
}

/** What 1 NVC on an option would return right now (for the odds shown on the card). */
export function marketOdds(poolA: number, poolB: number, option: MarketOption) {
  const mine = option === 'A' ? poolA : poolB;
  const pot = poolA + poolB;
  if (!mine) return null;
  return Math.max(1, (pot * (1 - MARKET_FEE)) / mine);
}
