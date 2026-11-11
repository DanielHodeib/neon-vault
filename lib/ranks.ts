export type Rank = { tag: string; color: string; minLevel: number; minBalance: number; ownerFriend?: boolean };

export const RANKS: Rank[] = [
  { tag: 'BALLER', color: '#fb923c', minLevel: 1, minBalance: 0, ownerFriend: true },
  { tag: 'BRONZE', color: '#d97706', minLevel: 1, minBalance: 0 },
  { tag: 'IRON', color: '#9ca3af', minLevel: 2, minBalance: 2_500 },
  { tag: 'COPPER', color: '#b45309', minLevel: 3, minBalance: 5_000 },
  { tag: 'STEEL', color: '#94a3b8', minLevel: 4, minBalance: 12_000 },
  { tag: 'SILVER', color: '#cbd5e1', minLevel: 6, minBalance: 25_000 },
  { tag: 'EMERALD', color: '#10b981', minLevel: 8, minBalance: 60_000 },
  { tag: 'GOLD', color: '#fbbf24', minLevel: 10, minBalance: 100_000 },
  { tag: 'PLATINUM', color: '#93c5fd', minLevel: 14, minBalance: 250_000 },
  { tag: 'DIAMOND', color: '#60a5fa', minLevel: 18, minBalance: 500_000 },
  { tag: 'RUBY', color: '#ef4444', minLevel: 20, minBalance: 750_000 },
  { tag: 'MASTER', color: '#8b5cf6', minLevel: 22, minBalance: 1_000_000 },
  { tag: 'ELITE', color: '#ec4899', minLevel: 26, minBalance: 2_500_000 },
  { tag: 'HIGH_ROLLER', color: '#06b6d4', minLevel: 1, minBalance: 3_500_000 },
  { tag: 'TYCOON', color: '#22c55e', minLevel: 1, minBalance: 5_000_000 },
  { tag: 'CASINO_LORD', color: '#84cc16', minLevel: 1, minBalance: 7_500_000 },
  { tag: 'MILLIONAIRE', color: '#14b8a6', minLevel: 1, minBalance: 10_000_000 },
  { tag: 'MULTI_MILLIONAIRE', color: '#0ea5e9', minLevel: 1, minBalance: 25_000_000 },
  { tag: 'BILLIONAIRE', color: '#eab308', minLevel: 1, minBalance: 50_000_000 },
  { tag: 'CASINO_EMPEROR', color: '#f97316', minLevel: 1, minBalance: 100_000_000 },
  { tag: 'NEON_OVERLORD', color: '#22d3ee', minLevel: 1, minBalance: 150_000_000 },
];

export const levelOf = (xp: number) => Math.floor(xp / 1000) + 1;

export const rankAllowed = (rank: Rank, xp: number, balance: number, ownerFriend: boolean) =>
  (!rank.ownerFriend || ownerFriend) && levelOf(xp) >= rank.minLevel && balance >= rank.minBalance;

/** The chosen tag if the user still qualifies, otherwise the best one they do. */
export function displayRank(tag: string, xp: number, balance: number, ownerFriend = false): Rank {
  const chosen = RANKS.find((r) => r.tag === tag);
  if (chosen && rankAllowed(chosen, xp, balance, ownerFriend)) return chosen;
  return RANKS.filter((r) => !r.ownerFriend && rankAllowed(r, xp, balance, false)).at(-1) ?? RANKS[1];
}
