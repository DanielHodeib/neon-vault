import { NextResponse } from 'next/server';
import { QuestPeriod, type Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { notifyLeaderboardRefresh } from '@/lib/leaderboardEvents';
import { prisma } from '@/lib/prisma';
import { ensureUserQuests, resetExpiredUserQuests } from '@/lib/userQuests';

const DAILY_XP = 5000;
const WEEKLY_XP = 20000;

function addBalances(balance: string | number, amount: string | number): string {
  const b = typeof balance === 'string' ? parseFloat(balance) : balance;
  const a = typeof amount === 'string' ? parseFloat(amount) : amount;
  return (b + a).toFixed(2);
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { period?: 'daily' | 'weekly' };
  try {
    payload = (await request.json()) as { period?: 'daily' | 'weekly' };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const period = payload.period;
  if (period !== 'daily' && period !== 'weekly') {
    return NextResponse.json({ error: 'Invalid claim period.' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await ensureUserQuests(tx, userId);
    await resetExpiredUserQuests(tx, userId);

    const questPeriod = period === 'daily' ? QuestPeriod.DAILY : QuestPeriod.WEEKLY;
    const quests = await tx.userQuest.findMany({
      where: { userId, period: questPeriod },
    });

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });

    if (!user || quests.length === 0) {
      return { error: 'Quest progress missing.' as const };
    }

    const allClaimed = quests.every((quest) => quest.claimed);
    if (allClaimed) {
      return { error: `${period === 'daily' ? 'Daily' : 'Weekly'} reward already claimed.` as const };
    }

    const allComplete = quests.every((quest) => quest.progress >= quest.target);
    if (!allComplete) {
      return { error: `${period === 'daily' ? 'Daily' : 'Weekly'} quest not complete yet.` as const };
    }

    const reward = quests.reduce((sum, quest) => sum + Number.parseFloat(quest.reward || '0'), 0);
    const xpReward = period === 'daily' ? DAILY_XP : WEEKLY_XP;

    await tx.userQuest.updateMany({
      where: {
        userId,
        period: questPeriod,
      },
      data: { claimed: true },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        balance: addBalances(user.balance ?? '0.00', reward),
        xp: { increment: xpReward },
      },
      select: { balance: true, xp: true },
    });

    return {
      ok: true as const,
      reward,
      xpReward,
      balance: updatedUser.balance,
      xp: updatedUser.xp,
    };
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.reward >= 5000) {
    void notifyLeaderboardRefresh({
      amount: result.reward,
      reason: 'quest-claim',
    });
  }

  return NextResponse.json(result);
}
