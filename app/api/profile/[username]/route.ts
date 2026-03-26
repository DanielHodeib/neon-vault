import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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

  return NextResponse.json({
    profile: {
      username: target.username,
      balance: target.balance,
      xp: target.xp,
      favoriteGame: 'Crash (v1 placeholder)',
      bio: target.settings?.bio ?? '',
      theme: target.settings?.theme ?? 'slate',
      publicProfile,
      isFriend,
      createdAt: target.createdAt,
      friendsCount,
    },
  });
}
