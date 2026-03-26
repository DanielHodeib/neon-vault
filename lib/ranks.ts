export interface RankInfo {
  xp: number;
  level: number;
  tag: 'BRONZE' | 'SILBER' | 'GOLD' | 'NEON';
  color: string;
}

export type RankTag = RankInfo['tag'];

export const RANKS: Array<{ tag: RankTag; color: string; minLevel: number }> = [
  { tag: 'BRONZE', color: '#d97706', minLevel: 1 },
  { tag: 'SILBER', color: '#cbd5e1', minLevel: 10 },
  { tag: 'GOLD', color: '#fbbf24', minLevel: 20 },
  { tag: 'NEON', color: '#22d3ee', minLevel: 40 },
];

export function isRankTag(value: string): value is RankTag {
  return RANKS.some((rank) => rank.tag === value);
}

export function canUseRankTag(level: number, tag: RankTag) {
  const rank = RANKS.find((entry) => entry.tag === tag);
  if (!rank) {
    return false;
  }

  return level >= rank.minLevel;
}

export function getRankColor(tag: RankTag) {
  return RANKS.find((rank) => rank.tag === tag)?.color ?? '#64748b';
}

export function getRankInfo(rawXp: number): RankInfo {
  const xp = Number.isFinite(rawXp) ? Math.max(0, Math.floor(rawXp)) : 0;
  const level = Math.floor(xp / 1000) + 1;

  const highestUnlocked = [...RANKS].reverse().find((rank) => level >= rank.minLevel) ?? RANKS[0];
  return { xp, level, tag: highestUnlocked.tag, color: highestUnlocked.color };
}
