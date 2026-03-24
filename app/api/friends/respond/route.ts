import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type FriendResponseAction = 'accept' | 'decline';

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { friendshipId?: string; action?: FriendResponseAction };
  try {
    payload = (await request.json()) as { friendshipId?: string; action?: FriendResponseAction };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const friendshipId = (payload.friendshipId ?? '').trim();
  const action = payload.action;

  if (!friendshipId || (action !== 'accept' && action !== 'decline')) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const pending = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      friendId: userId,
      status: 'pending',
    },
    select: { id: true },
  });

  if (!pending) {
    return NextResponse.json({ error: 'Pending request not found.' }, { status: 404 });
  }

  if (action === 'decline') {
    await prisma.friendship.delete({ where: { id: friendshipId } });
    return NextResponse.json({ ok: true, action: 'decline' });
  }

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: 'accepted' },
    select: { id: true, status: true },
  });

  return NextResponse.json({ ok: true, action: 'accept', friendship: updated });
}
