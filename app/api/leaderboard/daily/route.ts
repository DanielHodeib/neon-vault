import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayKey();

  const users = await prisma.user.findMany({
    where: {
      dailyStatsDate: today,
    },
    select: {
      username: true,
      dailyBets: true,
      dailyWins: true,
    },
  });

  const dailyLeaderboard = users
    .map((entry) => {
      const netProfit = Number(entry.dailyWins) - Number(entry.dailyBets);
      return {
        username: entry.username,
        netProfit,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 5)
    .map((entry, index) => ({
      rank: index + 1,
      username: entry.username,
      netProfit: entry.netProfit,
      isKing: index === 0,
    }));

  return NextResponse.json({
    today,
    dailyLeaderboard,
    generatedAt: Date.now(),
  });
}
