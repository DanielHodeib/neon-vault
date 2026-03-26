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

  let user:
    | {
        id: string;
        username: string;
        role: string;
        clanTag: string | null;
        balance: string;
        xp: number;
        dailyStatsDate: string;
        dailyBets: number;
        dailyWins: number;
        dailyFaucetClaimed: boolean;
        dailyQuestClaimed: boolean;
      }
    | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        clanTag: true,
        balance: true,
        xp: true,
        dailyStatsDate: true,
        dailyBets: true,
        dailyWins: true,
        dailyFaucetClaimed: true,
        dailyQuestClaimed: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const missingRoleColumns =
      message.includes('Unknown field `role`') || message.includes('Unknown field `clanTag`') || message.includes('Unknown field `clan`');

    if (!missingRoleColumns) {
      throw error;
    }

    const fallbackUser = await prisma.user.findUnique({
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

    user = fallbackUser
      ? {
          ...fallbackUser,
          role: 'USER',
          clanTag: null,
        }
      : null;
  }

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const rank = getRankInfo(user.xp, user.balance);
  return NextResponse.json({ user: { ...user, level: rank.level, rankTag: rank.tag, rankColor: rank.color } });
}
