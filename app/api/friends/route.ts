import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type AcceptedEntry = {
  id: string;
  userId: string;
  createdAt: Date;
  user: { id: string; username: string };
  friend: { id: string; username: string };
};

type PendingIncomingEntry = {
  id: string;
  createdAt: Date;
  user: { id: string; username: string };
};

type PendingOutgoingEntry = {
  id: string;
  createdAt: Date;
  friend: { id: string; username: string };
};

type BlockedEntry = {
  id: string;
  createdAt: Date;
  blockedUser: { id: string; username: string };
};

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [acceptedRaw, pendingIncomingRaw, pendingOutgoingRaw, blockedRaw] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: { select: { id: true, username: true } },
        friend: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendship.findMany({
      where: {
        status: 'pending',
        friendId: userId,
      },
      include: {
        user: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendship.findMany({
      where: {
        status: 'pending',
        userId,
      },
      include: {
        friend: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.block.findMany({
      where: { userId },
      include: {
        blockedUser: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const accepted = acceptedRaw.map((entry: AcceptedEntry) => {
    const counterpart = entry.userId === userId ? entry.friend : entry.user;
    return {
      friendshipId: entry.id,
      userId: counterpart.id,
      username: counterpart.username,
      since: entry.createdAt,
    };
  });

  const pendingIncoming = pendingIncomingRaw.map((entry: PendingIncomingEntry) => ({
    friendshipId: entry.id,
    userId: entry.user.id,
    username: entry.user.username,
    requestedAt: entry.createdAt,
  }));

  const pendingOutgoing = pendingOutgoingRaw.map((entry: PendingOutgoingEntry) => ({
    friendshipId: entry.id,
    userId: entry.friend.id,
    username: entry.friend.username,
    requestedAt: entry.createdAt,
  }));

  const blocked = blockedRaw.map((entry: BlockedEntry) => ({
    blockId: entry.id,
    userId: entry.blockedUser.id,
    username: entry.blockedUser.username,
    blockedAt: entry.createdAt,
  }));

  return NextResponse.json({ accepted, pendingIncoming, pendingOutgoing, blocked });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { username?: string };
  try {
    payload = (await request.json()) as { username?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const username = (payload.username ?? '').trim();
  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });

  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (target.id === userId) {
    return NextResponse.json({ error: 'You cannot add yourself.' }, { status: 400 });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId, friendId: target.id },
        { userId: target.id, friendId: userId },
      ],
    },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status === 'accepted') {
      return NextResponse.json({ error: 'Already friends.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Friend request already pending.' }, { status: 409 });
  }

  const created = await prisma.friendship.create({
    data: {
      userId,
      friendId: target.id,
      status: 'pending',
    },
    select: {
      id: true,
      createdAt: true,
      friend: { select: { id: true, username: true } },
    },
  });

  return NextResponse.json(
    {
      request: {
        friendshipId: created.id,
        userId: created.friend.id,
        username: created.friend.username,
        requestedAt: created.createdAt,
      },
    },
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const friendshipId = (searchParams.get('friendshipId') ?? '').trim();

  if (!friendshipId) {
    return NextResponse.json({ error: 'friendshipId is required.' }, { status: 400 });
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      OR: [{ userId }, { friendId: userId }],
    },
    select: { id: true },
  });

  if (!friendship) {
    return NextResponse.json({ error: 'Friendship not found.' }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });
  return NextResponse.json({ ok: true });
}
