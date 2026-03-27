import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

function getGameServerUrl() {
  const fromEnv =
    process.env.GAME_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (!fromEnv || fromEnv === 'same-origin') {
    return 'http://localhost:4001';
  }

  try {
    return new URL(fromEnv).toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:4001';
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (!sessionUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { username: usernameParam } = await params;
  const username = decodeURIComponent(usernameParam ?? '').trim();

  if (!username) {
    return NextResponse.json({ error: 'Username required.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      balance: true,
      xp: true,
      createdAt: true,
      settings: {
        select: {
          publicProfile: true,
          bio: true,
          theme: true,
        },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const isSelf = target.id === sessionUserId;

  let isFriend = false;
  if (!isSelf) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { userId: sessionUserId, friendId: target.id },
          { userId: target.id, friendId: sessionUserId },
        ],
      },
      select: { id: true },
    });
    isFriend = Boolean(friendship);
  }

  const publicProfile = target.settings?.publicProfile ?? true;
  if (!isSelf && !isFriend && !publicProfile) {
    return NextResponse.json({ error: 'Profile is private.' }, { status: 403 });
  }

  const friendsCount = await prisma.friendship.count({
    where: {
      status: 'accepted',
      OR: [{ userId: target.id }, { friendId: target.id }],
    },
  });

  let favoriteGame = 'Unknown';
  try {
    const gameServerUrl = getGameServerUrl();
    const favoriteResponse = await fetch(
      `${gameServerUrl}/favorite-game/${encodeURIComponent(target.username)}`,
      { cache: 'no-store' }
    );

    if (favoriteResponse.ok) {
      const favoritePayload = (await favoriteResponse.json()) as { game?: string };
      const nextFavorite = typeof favoritePayload.game === 'string' ? favoritePayload.game.trim() : '';
      if (nextFavorite) {
        favoriteGame = nextFavorite;
      }
    }
  } catch {
    // Keep a stable fallback if game-server is unavailable.
  }

  return NextResponse.json({
    profile: {
      username: target.username,
      balance: Number.isFinite(Number(target.balance)) ? Number(target.balance) : 0,
      xp: target.xp,
      favoriteGame,
      bio: target.settings?.bio ?? '',
      theme: target.settings?.theme ?? 'slate',
      publicProfile,
      isFriend,
      createdAt: target.createdAt,
      friendsCount,
    },
  });
}
