import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const top = await prisma.user.findMany({
    orderBy: { balance: 'desc' },
    take: 50,
    select: {
      username: true,
      balance: true,
      xp: true,
    },
  });

  return NextResponse.json({ leaderboard: top });
}
