import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type BalanceActionType = 'bet' | 'win';

interface BalancePostPayload {
  amount?: number | string;
  type?: BalanceActionType;
}

const MAX_WALLET_AMOUNT = 999999999999; // 12 digit max

function normalizeAmount(raw: number | string): string {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return '0.00';
  }

  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  if (rounded <= 0 || rounded > MAX_WALLET_AMOUNT) {
    return '0.00';
  }

  return rounded.toFixed(2);
}

function addBalances(balance: string | number, amount: string | number): string {
  const b = typeof balance === 'string' ? parseFloat(balance) : balance;
  const a = typeof amount === 'string' ? parseFloat(amount) : amount;
  return (b + a).toFixed(2);
}

function subtractBalances(balance: string | number, amount: string | number): string {
  const b = typeof balance === 'string' ? parseFloat(balance) : balance;
  const a = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.max(0, b - a).toFixed(2);
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
  const amountStr = normalizeAmount(payload.amount ?? 0);
  const amount = parseFloat(amountStr);

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

    if (type === 'bet' && parseFloat(current.balance) < amount) {
      return { error: 'Insufficient balance' as const, balance: current.balance };
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        balance: type === 'win' ? addBalances(current.balance, amount) : subtractBalances(current.balance, amount),
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
