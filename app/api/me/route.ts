import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getRankInfo } from '@/lib/ranks';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      balance: true,
      xp: true,
      dailyStatsDate: true,
      dailyBets: true,
      dailyWins: true,
      dailyFaucetClaimed: true,
      dailyQuestClaimed: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const rank = getRankInfo(user.xp);
  return NextResponse.json({ user: { ...user, level: rank.level, rankTag: rank.tag, rankColor: rank.color } });
}
