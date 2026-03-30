import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function getGameServerUrl() {
  const fromEnv =
    process.env.GAME_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (!fromEnv) {
    return 'http://localhost:5000';
  }

  if (fromEnv === 'same-origin') {
    return 'http://localhost:5000';
  }

  try {
    return new URL(fromEnv).toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:5000';
  }
}

export async function GET() {
  const gameServerUrl = getGameServerUrl();

  try {
    const response = await fetch(`${gameServerUrl}/presence`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ onlineCount: 0, users: [] });
    }

    const payload = (await response.json()) as {
      onlineCount?: number;
      users?: Array<{ username: string; activity: string; online: boolean }>;
    };

    const usernames = Array.from(
      new Set(
        (payload.users ?? [])
          .map((entry) => String(entry?.username ?? '').trim())
          .filter((entry) => entry.length > 0)
      )
    );

    const users = usernames.length
      ? await prisma.user.findMany({
          where: { username: { in: usernames } },
          select: { id: true, username: true, role: true },
        })
      : [];

    const byUsername = new Map(users.map((entry) => [entry.username.toLowerCase(), entry]));

    const enrichedUsers = (payload.users ?? []).map((entry) => {
      const username = String(entry?.username ?? '').trim();
      const mapped = byUsername.get(username.toLowerCase());

      return {
        username,
        activity: entry?.activity,
        online: entry?.online,
        userId: mapped?.id ?? null,
        role: mapped?.role ?? null,
      };
    });

    return NextResponse.json({
      onlineCount: payload.onlineCount ?? 0,
      users: enrichedUsers,
    });
  } catch {
    return NextResponse.json({ onlineCount: 0, users: [] });
  }
}
