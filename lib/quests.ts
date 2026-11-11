import { db, notify, UserError } from './hub';
import { applyLedger, startOfDay, startOfWeek } from './wallet';

type Quest = { key: string; weekly: boolean; title: string; description: string; target: number; reward: number; count: 'bets' | 'wins' | 'slots' };

export const QUESTS: Quest[] = [
  { key: 'daily_bets', weekly: false, title: 'Roulette-König', description: '10 Einsätze an einem Tag.', target: 10, reward: 50_000, count: 'bets' },
  { key: 'daily_wins', weekly: false, title: 'Crash-Sprinter', description: 'Gewinne 4 Runden an einem Tag.', target: 4, reward: 50_000, count: 'wins' },
  { key: 'daily_slots', weekly: false, title: 'Slots-Grinder', description: '30 Slots-Spins an einem Tag.', target: 30, reward: 50_000, count: 'slots' },
  { key: 'weekly_bets', weekly: true, title: 'High-Volume-Trader', description: '150 Einsätze in dieser Woche.', target: 150, reward: 250_000, count: 'bets' },
  { key: 'weekly_wins', weekly: true, title: 'Streak-Hunter', description: 'Gewinne 35 Runden in dieser Woche.', target: 35, reward: 300_000, count: 'wins' },
  { key: 'weekly_slots', weekly: true, title: 'Mega-Reeler', description: '180 Slots-Spins in dieser Woche.', target: 180, reward: 350_000, count: 'slots' },
];

// Cancelled bets are subtracted so bet-and-cancel can't farm quests.
const COUNT = {
  bets: [{ kind: 'BET' }, { kind: 'CANCEL' }],
  wins: [{ kind: 'WIN' }, null],
  slots: [{ kind: 'BET', game: 'slots' }, { kind: 'CANCEL', game: 'slots' }],
} as const;

// Progress is derived from the ledger, so there is nothing to reset or increment.
export async function questStatus(userId: string) {
  const day = startOfDay();
  const week = startOfWeek();
  const claims = await db.questClaim.findMany({ where: { userId, periodStart: { in: [day, week] } } });
  return Promise.all(
    QUESTS.map(async (q) => {
      const periodStart = q.weekly ? week : day;
      const [plus, minus] = COUNT[q.count];
      const count = (where: object | null) => (where ? db.ledgerEntry.count({ where: { userId, createdAt: { gte: periodStart }, ...where } }) : 0);
      const progress = Math.max(0, (await count(plus)) - (await count(minus)));
      const claimed = claims.some((c) => c.questKey === q.key && c.periodStart.getTime() === periodStart.getTime());
      return { ...q, progress: Math.min(progress, q.target), claimed, periodStart };
    }),
  );
}

export async function claimQuest(userId: string, key: string) {
  const quest = (await questStatus(userId)).find((q) => q.key === key);
  if (!quest) throw new UserError('Unbekannte Quest.');
  if (quest.claimed) throw new UserError('Bereits abgeholt.');
  if (quest.progress < quest.target) throw new UserError('Quest noch nicht erfüllt.');
  // The composite primary key makes a double claim fail even under a race.
  await db.questClaim.create({ data: { userId, questKey: key, periodStart: quest.periodStart } });
  await applyLedger([{ userId, amount: quest.reward, kind: 'QUEST', note: quest.title }]);
  await notify(userId, 'Quest abgeschlossen', `${quest.title}: +${quest.reward} NVC`);
}
