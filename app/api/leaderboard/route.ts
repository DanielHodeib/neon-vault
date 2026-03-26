import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    select: {
      username: true,
      balance: true,
      xp: true,
    },
  });

  const top = users
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 50);

  return NextResponse.json({ leaderboard: top });
}
