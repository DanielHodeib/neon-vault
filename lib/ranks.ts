export interface RankInfo {
  xp: number;
  level: number;
  tag: RankTag;
  color: string;
}

export type RankTag =
  | 'BRONZE'
  | 'COPPER'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'MASTER'
  | 'ELITE'
  | 'TYCOON'
  | 'MILLIONAIRE'
  | 'BILLIONAIRE'
  | 'NEON_OVERLORD';

export const RANKS: Array<{ tag: RankTag; color: string; minLevel: number; minBalance: number }> = [
  { tag: 'BRONZE', color: '#d97706', minLevel: 1, minBalance: 0 },
  { tag: 'COPPER', color: '#b45309', minLevel: 3, minBalance: 5000 },
  { tag: 'SILVER', color: '#cbd5e1', minLevel: 6, minBalance: 25000 },
  { tag: 'GOLD', color: '#fbbf24', minLevel: 10, minBalance: 100000 },
  { tag: 'PLATINUM', color: '#93c5fd', minLevel: 14, minBalance: 250000 },
  { tag: 'DIAMOND', color: '#60a5fa', minLevel: 18, minBalance: 500000 },
  { tag: 'MASTER', color: '#8b5cf6', minLevel: 22, minBalance: 1000000 },
  { tag: 'ELITE', color: '#ec4899', minLevel: 26, minBalance: 2500000 },
  { tag: 'TYCOON', color: '#22c55e', minLevel: 30, minBalance: 5000000 },
  { tag: 'MILLIONAIRE', color: '#14b8a6', minLevel: 34, minBalance: 10000000 },
  { tag: 'BILLIONAIRE', color: '#eab308', minLevel: 40, minBalance: 50000000 },
  { tag: 'NEON_OVERLORD', color: '#22d3ee', minLevel: 48, minBalance: 150000000 },
];

export function isRankTag(value: string): value is RankTag {
  return RANKS.some((rank) => rank.tag === value);
}

export function canUseRankTag(level: number, balance: number, tag: RankTag) {
  const rank = RANKS.find((entry) => entry.tag === tag);
  if (!rank) {
    return false;
  }

  return level >= rank.minLevel && balance >= rank.minBalance;
}

export function getRankColor(tag: RankTag) {
  return RANKS.find((rank) => rank.tag === tag)?.color ?? '#64748b';
}

export function getRankInfo(rawXp: number, rawBalance: number = Number.MAX_SAFE_INTEGER): RankInfo {
  const xp = Number.isFinite(rawXp) ? Math.max(0, Math.floor(rawXp)) : 0;
  const balance = Number.isFinite(rawBalance) ? Math.max(0, Math.floor(rawBalance)) : 0;
  const level = Math.floor(xp / 1000) + 1;

  const highestUnlocked = [...RANKS].reverse().find((rank) => level >= rank.minLevel && balance >= rank.minBalance) ?? RANKS[0];
  return { xp, level, tag: highestUnlocked.tag, color: highestUnlocked.color };
}
