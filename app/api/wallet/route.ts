import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type WalletAction = 'bet' | 'win' | 'faucet';

interface WalletRequestBody {
  action?: WalletAction;
  amount?: number;
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: WalletRequestBody;
  try {
    body = (await request.json()) as WalletRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  const rawAmount = Number(body.amount ?? 0);
  const amount = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 0;

  if (!action || !['bet', 'win', 'faucet'].includes(action)) {
    return NextResponse.json({ error: 'Invalid wallet action' }, { status: 400 });
  }

  if (action !== 'faucet' && amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }

  if (action === 'faucet') {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: 1000 } },
      select: { balance: true },
    });

    return NextResponse.json({ balance: updated.balance });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });

    if (!current) {
      return { error: 'User not found' as const };
    }

    if (action === 'bet' && current.balance < amount) {
      return { error: 'Insufficient balance' as const, balance: current.balance };
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: action === 'win' ? amount : -amount,
        },
      },
      select: { balance: true },
    });

    return { balance: updated.balance };
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error, balance: result.balance ?? 0 }, { status: 400 });
  }

  return NextResponse.json({ balance: result.balance });
}
