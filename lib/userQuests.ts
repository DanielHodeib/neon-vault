import type { Prisma } from '@prisma/client';
import { QuestPeriod } from '@prisma/client';

export type QuestDefinition = {
  period: QuestPeriod;
  questKey: string;
  title: string;
  description: string;
  target: number;
  reward: number;
};

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    period: QuestPeriod.DAILY,
    questKey: 'daily_bet_actions',
    title: 'Roulette-Koenig',
    description: 'Setze 10x auf Rot oder allgemein 10 Bet-Aktionen.',
    target: 10,
    reward: 50000,
  },
  {
    period: QuestPeriod.DAILY,
    questKey: 'daily_win_actions',
    title: 'Crash Sprinter',
    description: 'Gewinne 4 Runden an einem Tag.',
    target: 4,
    reward: 50000,
  },
  {
    period: QuestPeriod.DAILY,
    questKey: 'daily_slots_spins',
    title: 'Slots Grinder',
    description: 'Spiele 30 Slots-Spins pro Tag.',
    target: 30,
    reward: 50000,
  },
  {
    period: QuestPeriod.WEEKLY,
    questKey: 'weekly_bet_actions',
    title: 'High Volume Trader',
    description: 'Fuehre 150 Bet-Aktionen in dieser Woche aus.',
    target: 150,
    reward: 250000,
  },
  {
    period: QuestPeriod.WEEKLY,
    questKey: 'weekly_win_actions',
    title: 'Streak Hunter',
    description: 'Gewinne 35 Runden in dieser Woche.',
    target: 35,
    reward: 300000,
  },
  {
    period: QuestPeriod.WEEKLY,
    questKey: 'weekly_slots_spins',
    title: 'Mega Reeler',
    description: 'Absolviere 180 Slots-Spins in dieser Woche.',
    target: 180,
    reward: 350000,
  },
];

function getPeriodStart(period: QuestPeriod, now = new Date()) {
  if (period === QuestPeriod.DAILY) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const pivot = new Date(now);
  const day = pivot.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  pivot.setUTCDate(pivot.getUTCDate() + diffToMonday);
  return new Date(Date.UTC(pivot.getUTCFullYear(), pivot.getUTCMonth(), pivot.getUTCDate()));
}

export async function ensureUserQuests(tx: Prisma.TransactionClient, userId: string) {
  const now = new Date();

  for (const definition of QUEST_DEFINITIONS) {
    const periodStart = getPeriodStart(definition.period, now);

    await tx.userQuest.upsert({
      where: {
        userId_period_questKey: {
          userId,
          period: definition.period,
          questKey: definition.questKey,
        },
      },
      update: {
        title: definition.title,
        description: definition.description,
        target: definition.target,
        reward: String(definition.reward),
      },
      create: {
        userId,
        period: definition.period,
        questKey: definition.questKey,
        title: definition.title,
        description: definition.description,
        target: definition.target,
        reward: String(definition.reward),
        lastResetAt: periodStart,
      },
    });
  }
}

export async function resetExpiredUserQuests(tx: Prisma.TransactionClient, userId: string) {
  const now = new Date();
  const dailyStart = getPeriodStart(QuestPeriod.DAILY, now);
  const weeklyStart = getPeriodStart(QuestPeriod.WEEKLY, now);

  await tx.userQuest.updateMany({
    where: {
      userId,
      period: QuestPeriod.DAILY,
      lastResetAt: { lt: dailyStart },
    },
    data: {
      progress: 0,
      claimed: false,
      lastResetAt: dailyStart,
    },
  });

  await tx.userQuest.updateMany({
    where: {
      userId,
      period: QuestPeriod.WEEKLY,
      lastResetAt: { lt: weeklyStart },
    },
    data: {
      progress: 0,
      claimed: false,
      lastResetAt: weeklyStart,
    },
  });
}

export async function incrementQuestProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  questKey: string,
  amount = 1,
) {
  if (amount <= 0) {
    return;
  }

  await tx.userQuest.updateMany({
    where: {
      userId,
      questKey,
      claimed: false,
    },
    data: {
      progress: { increment: amount },
    },
  });
}
