import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type BalanceActionType = 'bet' | 'win';

interface BalancePostPayload {
  amount?: number | string;
  type?: BalanceActionType;
}

const MAX_WALLET_AMOUNT = Number.MAX_SAFE_INTEGER / 100;

function normalizeAmount(raw: number | string) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  if (rounded <= 0 || rounded > MAX_WALLET_AMOUNT) {
    return 0;
  }

  return rounded;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ balance: user.balance });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: BalancePostPayload;
  try {
    payload = (await request.json()) as BalancePostPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const type = payload.type;
  const amount = normalizeAmount(payload.amount ?? 0);

  if ((type !== 'bet' && type !== 'win') || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount or action type' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });

    if (!current) {
      return { error: 'User not found' as const };
    }

    if (type === 'bet' && current.balance < amount) {
      return { error: 'Insufficient balance' as const, balance: current.balance };
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        balance: { increment: type === 'win' ? amount : -amount },
      },
      select: { balance: true },
    });

    return { balance: updated.balance };
  });

  if ('error' in result) {
    return NextResponse.json(
      {
        error: result.error,
        balance: result.balance,
      },
      { status: result.error === 'Insufficient balance' ? 400 : 404 }
    );
  }

  return NextResponse.json({ balance: result.balance });
}
