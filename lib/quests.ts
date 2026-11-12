import { db, notify, UserError } from './hub';
import { applyLedger, startOfDay, startOfWeek } from './wallet';

type Quest = { key: string; weekly: boolean; title: string; description: string; target: number; reward: number; count: 'bets' | 'wins' | 'slots' | 'arcade' | 'duels' };

export const QUESTS: Quest[] = [
  { key: 'daily_bets', weekly: false, title: 'Roulette-König', description: '10 Einsätze ab 100 NVC an einem Tag.', target: 10, reward: 7_500, count: 'bets' },
  { key: 'daily_wins', weekly: false, title: 'Crash-Sprinter', description: 'Gewinne 4 Runden (ab 100 NVC) an einem Tag.', target: 4, reward: 7_500, count: 'wins' },
  { key: 'daily_slots', weekly: false, title: 'Slots-Grinder', description: '30 Slots-Spins ab 100 NVC an einem Tag.', target: 30, reward: 7_500, count: 'slots' },
  { key: 'daily_arcade', weekly: false, title: 'Neugierig', description: '15 Runden ab 100 NVC in Limbo, Keno, Tower, Baccarat, Rubbellos oder Video Poker.', target: 15, reward: 7_500, count: 'arcade' },
  { key: 'weekly_bets', weekly: true, title: 'High-Volume-Trader', description: '150 Einsätze ab 100 NVC in dieser Woche.', target: 150, reward: 40_000, count: 'bets' },
  { key: 'weekly_wins', weekly: true, title: 'Streak-Hunter', description: 'Gewinne 35 Runden (ab 100 NVC) in dieser Woche.', target: 35, reward: 50_000, count: 'wins' },
  { key: 'weekly_slots', weekly: true, title: 'Mega-Reeler', description: '180 Slots-Spins ab 100 NVC in dieser Woche.', target: 180, reward: 60_000, count: 'slots' },
  { key: 'weekly_duels', weekly: true, title: 'Duellmeister', description: 'Gewinne 3 Duelle in der Arena.', target: 3, reward: 40_000, count: 'duels' },
];

/** Only stakes from this size count for quests, so 1-NVC spam can't farm the rewards. */
export const QUEST_MIN_STAKE = 100;

// Cancelled bets are subtracted so bet-and-cancel can't farm quests.
const ARCADE = ['limbo', 'keno', 'tower', 'baccarat', 'scratch', 'vpoker'];
const bigBet = { amount: { lte: -QUEST_MIN_STAKE } };
const bigBack = { amount: { gte: QUEST_MIN_STAKE } };
const COUNT = {
  bets: [{ kind: 'BET', ...bigBet }, { kind: 'CANCEL', ...bigBack }],
  wins: [{ kind: 'WIN', ...bigBack }, null],
  slots: [{ kind: 'BET', game: 'slots', ...bigBet }, { kind: 'CANCEL', game: 'slots', ...bigBack }],
  arcade: [{ kind: 'BET', game: { in: ARCADE }, ...bigBet }, { kind: 'CANCEL', game: { in: ARCADE }, ...bigBack }],
  duels: [{ kind: 'WIN', game: 'duel' }, null],
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
  await notify(userId, 'Quest abgeschlossen', `${quest.title}: +${quest.reward} NVC`, { link: '/quests' });
}
