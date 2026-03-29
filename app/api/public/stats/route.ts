import { NextResponse } from 'next/server';

import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const totalUsersPromise = prisma.user.count();

    let onlineUsers = 0;
    let activeTables = 0;

    try {
      const gameServerUrl = getGameServerUrl();
      const response = await fetch(`${gameServerUrl}/internal/stats/live`, {
        cache: 'no-store',
        headers: getInternalHeaders(),
      });

      if (response.ok) {
        const payload = (await response.json()) as { onlineUsers?: number; activeTables?: number };
        onlineUsers = Number(payload.onlineUsers ?? 0);
        activeTables = Number(payload.activeTables ?? 0);
      }
    } catch {
      onlineUsers = 0;
      activeTables = 0;
    }

    const totalUsers = await totalUsersPromise;

    return NextResponse.json({
      totalUsers,
      onlineUsers,
      activeTables,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load public stats.' }, { status: 500 });
  }
}
