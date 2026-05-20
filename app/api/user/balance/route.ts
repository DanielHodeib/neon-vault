import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type BalanceActionType = 'bet' | 'win';

interface BalancePostPayload {
  amount?: number | string;
  type?: BalanceActionType;
}

const MAX_WALLET_AMOUNT = 999999999999n; // 12 digit max in cents

function normalizeAmount(raw: number | string): string {
  const s = typeof raw === 'number' ? raw.toString() : String(raw ?? '0');
  const m = /^\s*-?\d+(?:\.\d{0,})?\s*$/.exec(s);
  if (!m) return '0.00';

  const cents = toCents(s);
  if (cents <= 0n || cents > MAX_WALLET_AMOUNT * 100n) return '0.00';

  return centsToString(cents);
}

function toCents(value: string | number): bigint {
  const s = typeof value === 'number' ? value.toFixed(2) : String(value);
  const [whole, frac = ''] = s.split('.');
  const sign = whole.startsWith('-') ? -1n : 1n;
  const wholeDigits = BigInt(whole.replace(/[^0-9]/g, '') || '0');
  const fracDigits = (frac + '00').slice(0, 2);
  const cents = wholeDigits * 100n + BigInt(fracDigits);
  return sign * cents;
}

function centsToString(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const whole = (abs / 100n).toString();
  const frac = Number(abs % 100n).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

function addBalances(balance: unknown, amount: unknown): string {
  const b = typeof balance === 'object' && balance && 'toString' in (balance as any) ? String((balance as any).toString()) : String(balance ?? '0');
  const a = String(amount ?? '0');
  return centsToString(toCents(b) + toCents(a));
}

function subtractBalances(balance: unknown, amount: unknown): string {
  const b = typeof balance === 'object' && balance && 'toString' in (balance as any) ? String((balance as any).toString()) : String(balance ?? '0');
  const a = String(amount ?? '0');
  const result = toCents(b) - toCents(a);
  return centsToString(result < 0n ? 0n : result);
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

  const balanceStr = typeof user.balance === 'object' && user.balance && 'toString' in (user.balance as any) ? String((user.balance as any).toString()) : String(user.balance ?? '0');
  return NextResponse.json({ balance: balanceStr });
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

    if (type === 'bet') {
      const balCents = toCents(typeof current.balance === 'object' && current.balance && 'toString' in (current.balance as any) ? String((current.balance as any).toString()) : String(current.balance ?? '0'));
      const amtCents = toCents(amountStr);
      if (balCents < amtCents) {
        return { error: 'Insufficient balance' as const, balance: current.balance };
      }
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
