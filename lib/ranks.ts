export interface RankInfo {
  xp: number;
  level: number;
  tag: 'BRONZE' | 'SILBER' | 'GOLD' | 'NEON';
  color: string;
}

export function getRankInfo(rawXp: number): RankInfo {
  const xp = Number.isFinite(rawXp) ? Math.max(0, Math.floor(rawXp)) : 0;
  const level = Math.floor(xp / 1000) + 1;

  if (level >= 40) {
    return { xp, level, tag: 'NEON', color: '#22d3ee' };
  }

  if (level >= 20) {
    return { xp, level, tag: 'GOLD', color: '#fbbf24' };
  }

  if (level >= 10) {
    return { xp, level, tag: 'SILBER', color: '#cbd5e1' };
  }

  return { xp, level, tag: 'BRONZE', color: '#d97706' };
}
