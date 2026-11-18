import { clanLevel } from './clans';
import { db } from './hub';
import { QUEST_MIN_STAKE } from './quests';
import { startOfWeek } from './wallet';

export const weekKey = () => startOfWeek().toISOString().slice(0, 10);

/** Stakes this week of the given players (single stakes ≥ QUEST_MIN_STAKE, cancelled stakes taken off). */
export async function weekStakes(userIds: string[]) {
  const where = { userId: { in: userIds }, createdAt: { gte: startOfWeek() } };
  const [bets, cancels] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { ...where, kind: 'BET', amount: { lte: -QUEST_MIN_STAKE } }, _sum: { amount: true } }),
    db.ledgerEntry.aggregate({ where: { ...where, kind: 'CANCEL', amount: { gte: QUEST_MIN_STAKE } }, _sum: { amount: true } }),
  ]);
  return Math.max(0, -Number(bets._sum.amount ?? 0) - Number(cancels._sum.amount ?? 0));
}

/** XP of all members and the level it gives; null clan → level 1 with nothing. */
export async function clanLevelOf(clanId: string | null | undefined) {
  if (!clanId) return { xp: 0, level: 1 };
  const { _sum } = await db.user.aggregate({ where: { clanId }, _sum: { xp: true } });
  const xp = _sum.xp ?? 0;
  return { xp, level: clanLevel(xp) };
}
