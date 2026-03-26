export interface RankInfo {
  xp: number;
  level: number;
  tag: RankTag;
  color: string;
}

export type RankTag =
  | 'BRONZE'
  | 'IRON'
  | 'COPPER'
  | 'STEEL'
  | 'SILVER'
  | 'EMERALD'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'RUBY'
  | 'MASTER'
  | 'ELITE'
  | 'HIGH_ROLLER'
  | 'TYCOON'
  | 'CASINO_LORD'
  | 'MILLIONAIRE'
  | 'MULTI_MILLIONAIRE'
  | 'BILLIONAIRE'
  | 'CASINO_EMPEROR'
  | 'NEON_OVERLORD';

export const RANKS: Array<{ tag: RankTag; color: string; minLevel: number; minBalance: number }> = [
  { tag: 'BRONZE', color: '#d97706', minLevel: 1, minBalance: 0 },
  { tag: 'IRON', color: '#9ca3af', minLevel: 2, minBalance: 2500 },
  { tag: 'COPPER', color: '#b45309', minLevel: 3, minBalance: 5000 },
  { tag: 'STEEL', color: '#94a3b8', minLevel: 4, minBalance: 12000 },
  { tag: 'SILVER', color: '#cbd5e1', minLevel: 6, minBalance: 25000 },
  { tag: 'EMERALD', color: '#10b981', minLevel: 8, minBalance: 60000 },
  { tag: 'GOLD', color: '#fbbf24', minLevel: 10, minBalance: 100000 },
  { tag: 'PLATINUM', color: '#93c5fd', minLevel: 14, minBalance: 250000 },
  { tag: 'DIAMOND', color: '#60a5fa', minLevel: 18, minBalance: 500000 },
  { tag: 'RUBY', color: '#ef4444', minLevel: 20, minBalance: 750000 },
  { tag: 'MASTER', color: '#8b5cf6', minLevel: 22, minBalance: 1000000 },
  { tag: 'ELITE', color: '#ec4899', minLevel: 26, minBalance: 2500000 },
  { tag: 'HIGH_ROLLER', color: '#06b6d4', minLevel: 1, minBalance: 3500000 },
  { tag: 'TYCOON', color: '#22c55e', minLevel: 1, minBalance: 5000000 },
  { tag: 'CASINO_LORD', color: '#84cc16', minLevel: 1, minBalance: 7500000 },
  { tag: 'MILLIONAIRE', color: '#14b8a6', minLevel: 1, minBalance: 10000000 },
  { tag: 'MULTI_MILLIONAIRE', color: '#0ea5e9', minLevel: 1, minBalance: 25000000 },
  { tag: 'BILLIONAIRE', color: '#eab308', minLevel: 1, minBalance: 50000000 },
  { tag: 'CASINO_EMPEROR', color: '#f97316', minLevel: 1, minBalance: 100000000 },
  { tag: 'NEON_OVERLORD', color: '#22d3ee', minLevel: 1, minBalance: 150000000 },
];

export function isRankTag(value: string): value is RankTag {
  return RANKS.some((rank) => rank.tag === value);
}

export function canUseRankTag(level: number, balance: number | string, tag: RankTag) {
  const rank = RANKS.find((entry) => entry.tag === tag);
  if (!rank) {
    return false;
  }

  const balanceNum = typeof balance === 'string' ? parseFloat(balance) : balance;
  return level >= rank.minLevel && balanceNum >= rank.minBalance;
}

export function getRankColor(tag: RankTag) {
  return RANKS.find((rank) => rank.tag === tag)?.color ?? '#64748b';
}

export function getRankInfo(rawXp: number, rawBalance: number | string = Number.MAX_SAFE_INTEGER): RankInfo {
  const xp = Number.isFinite(rawXp) ? Math.max(0, Math.floor(rawXp)) : 0;
  const balanceNum = typeof rawBalance === 'string' ? parseFloat(rawBalance) : rawBalance;
  const balance = Number.isFinite(balanceNum) ? Math.max(0, Math.floor(balanceNum)) : 0;
  const level = Math.floor(xp / 1000) + 1;

  const highestUnlocked = [...RANKS].reverse().find((rank) => level >= rank.minLevel && balance >= rank.minBalance) ?? RANKS[0];
  return { xp, level, tag: highestUnlocked.tag, color: highestUnlocked.color };
}
