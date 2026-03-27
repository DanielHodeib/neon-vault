import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const STAFF_ROLES = new Set(['SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER']);

const STATUS_WEIGHT: Record<string, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  ANSWERED: 2,
  CLOSED: 3,
};

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const isStaff = STAFF_ROLES.has(String(currentUser?.role ?? '').toUpperCase());
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ticketsRaw = await prisma.ticket.findMany({
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      user: { select: { username: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          content: true,
          createdAt: true,
          isStaffReply: true,
        },
      },
    },
  });

  const tickets = [...ticketsRaw].sort((left, right) => {
    const leftWeight = STATUS_WEIGHT[left.status] ?? 99;
    const rightWeight = STATUS_WEIGHT[right.status] ?? 99;
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return Number(right.updatedAt) - Number(left.updatedAt);
  });

  return NextResponse.json({ ok: true, tickets });
}
