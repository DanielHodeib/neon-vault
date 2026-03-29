import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { assertAdminAccess } from '@/lib/adminAccess';
import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';

type OnlineStatsPayload = {
  ok?: boolean;
  onlineUsers?: number;
};

export async function GET() {
  const access = await assertAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const [totalUsers, users, activeTickets, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({ select: { balance: true } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, username: true, createdAt: true },
    }),
  ]);

  const totalEconomy = users.reduce((sum, user) => {
    const value = Number.parseFloat(user.balance || '0');
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  let onlineUsers = 0;
  const gameServerUrl = getGameServerUrl();
  const onlineResponse = await fetch(`${gameServerUrl}/internal/stats/online`, {
    method: 'GET',
    headers: getInternalHeaders(),
    cache: 'no-store',
  }).catch(() => null);

  if (onlineResponse?.ok) {
    const payload = (await onlineResponse.json()) as OnlineStatsPayload;
    onlineUsers = Number(payload.onlineUsers ?? 0);
  }

  return NextResponse.json({
    ok: true,
    metrics: {
      totalUsers,
      usersOnline: onlineUsers,
      totalEconomy,
      activeTickets,
    },
    recentActivity: recentUsers.map((entry) => ({
      id: entry.id,
      type: 'registration',
      label: `${entry.username} joined Neon Vault`,
      createdAt: entry.createdAt,
    })),
  });
}
