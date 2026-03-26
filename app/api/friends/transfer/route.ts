import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { notifyLeaderboardRefresh } from '@/lib/leaderboardEvents';
import { prisma } from '@/lib/prisma';

interface TransferPayload {
  targetUserId?: string;
  amount?: number;
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: TransferPayload;
  try {
    payload = (await request.json()) as TransferPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const targetUserId = (payload.targetUserId ?? '').trim();
  const amount = Number.isFinite(Number(payload.amount)) ? Math.floor(Number(payload.amount)) : 0;

  if (!targetUserId) {
    return NextResponse.json({ error: 'Target user is required.' }, { status: 400 });
  }

  if (targetUserId === userId) {
    return NextResponse.json({ error: 'You cannot send money to yourself.' }, { status: 400 });
  }

  if (amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0.' }, { status: 400 });
  }

  const [targetExists, friendship] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } }),
    prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!targetExists) {
    return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
  }

  if (!friendship) {
    return NextResponse.json({ error: 'You can only send NVC to accepted friends.' }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const sender = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, balance: true },
    });

    if (!sender) {
      return { error: 'Sender not found.' as const };
    }

    if (sender.balance < amount) {
      return { error: 'Insufficient balance.' as const, balance: sender.balance };
    }

    const [updatedSender] = await Promise.all([
      tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: amount } },
        select: { balance: true },
      }),
      tx.user.update({
        where: { id: targetUserId },
        data: { balance: { increment: amount } },
        select: { id: true },
      }),
    ]);

    return { ok: true as const, balance: updatedSender.balance };
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error, balance: result.balance }, { status: 400 });
  }

  if (amount >= 5000) {
    void notifyLeaderboardRefresh({
      amount,
      reason: 'friend-transfer',
    });
  }

  return NextResponse.json({ ok: true, balance: result.balance });
}
