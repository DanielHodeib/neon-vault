import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { targetUserId?: string };
  try {
    payload = (await request.json()) as { targetUserId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const targetUserId = (payload.targetUserId ?? '').trim();
  if (!targetUserId) {
    return NextResponse.json({ error: 'Target user is required.' }, { status: 400 });
  }

  if (targetUserId === userId) {
    return NextResponse.json({ error: 'You cannot block yourself.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.block.upsert({
      where: { userId_blockedUserId: { userId, blockedUserId: targetUserId } },
      update: {},
      create: { userId, blockedUserId: targetUserId },
    }),
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const blockId = (searchParams.get('blockId') ?? '').trim();

  if (!blockId) {
    return NextResponse.json({ error: 'blockId is required.' }, { status: 400 });
  }

  const existing = await prisma.block.findFirst({
    where: {
      id: blockId,
      userId,
    },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Block not found.' }, { status: 404 });
  }

  await prisma.block.delete({ where: { id: blockId } });
  return NextResponse.json({ ok: true });
}
