import { NextResponse } from 'next/server';
import { QuestPeriod } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureUserQuests, resetExpiredUserQuests } from '@/lib/userQuests';

function periodStartLabel(period: QuestPeriod, date: Date) {
  if (period === QuestPeriod.DAILY) {
    return date.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const quests = await prisma.$transaction(async (tx) => {
    await ensureUserQuests(tx, userId);
    await resetExpiredUserQuests(tx, userId);

    return tx.userQuest.findMany({
      where: { userId },
      orderBy: [{ period: 'asc' }, { questKey: 'asc' }],
    });
  });

  const dailyObjectives = quests
    .filter((quest) => quest.period === QuestPeriod.DAILY)
    .map((quest) => ({
      id: quest.questKey,
      label: `${quest.title}: ${quest.description}`,
      progress: Math.min(quest.progress, quest.target),
      target: quest.target,
      complete: quest.progress >= quest.target,
    }));

  const weeklyObjectives = quests
    .filter((quest) => quest.period === QuestPeriod.WEEKLY)
    .map((quest) => ({
      id: quest.questKey,
      label: `${quest.title}: ${quest.description}`,
      progress: Math.min(quest.progress, quest.target),
      target: quest.target,
      complete: quest.progress >= quest.target,
    }));

  const dailyQuests = quests.filter((quest) => quest.period === QuestPeriod.DAILY);
  const weeklyQuests = quests.filter((quest) => quest.period === QuestPeriod.WEEKLY);

  const dailyReward = dailyQuests.reduce((sum, quest) => sum + Number.parseFloat(quest.reward || '0'), 0);
  const weeklyReward = weeklyQuests.reduce((sum, quest) => sum + Number.parseFloat(quest.reward || '0'), 0);

  return NextResponse.json({
    daily: {
      date: periodStartLabel(QuestPeriod.DAILY, dailyQuests[0]?.lastResetAt ?? new Date()),
      objectives: dailyObjectives,
      claimed: dailyQuests.length > 0 && dailyQuests.every((quest) => quest.claimed),
      complete: dailyObjectives.length > 0 && dailyObjectives.every((objective) => objective.complete),
      reward: Math.floor(dailyReward),
      xpReward: 5000,
    },
    weekly: {
      date: periodStartLabel(QuestPeriod.WEEKLY, weeklyQuests[0]?.lastResetAt ?? new Date()),
      objectives: weeklyObjectives,
      claimed: weeklyQuests.length > 0 && weeklyQuests.every((quest) => quest.claimed),
      complete: weeklyObjectives.length > 0 && weeklyObjectives.every((objective) => objective.complete),
      reward: Math.floor(weeklyReward),
      xpReward: 20000,
    },
  });
}
