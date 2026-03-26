import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { notifyGlobalWinMessage, notifyLeaderboardRefresh } from '@/lib/leaderboardEvents';
import { prisma } from '@/lib/prisma';

type WalletAction = 'bet' | 'win' | 'faucet' | 'refund';

const DAILY_FAUCET_REWARD = 5000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

interface WalletRequestBody {
  action?: WalletAction;
  amount?: number | string;
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
  const amount = normalizeAmount(body.amount ?? 0);

  if (!action || !['bet', 'win', 'faucet', 'refund'].includes(action)) {
    return NextResponse.json({ error: 'Invalid wallet action' }, { status: 400 });
  }

  if (action !== 'faucet' && amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const today = todayKey();

    let current = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        balance: true,
        xp: true,
        dailyStatsDate: true,
        dailyBets: true,
        dailyWins: true,
        dailyFaucetClaimed: true,
        dailyQuestClaimed: true,
      },
    });

    if (!current) {
      return { error: 'User not found' as const };
    }

    if (current.dailyStatsDate !== today) {
      current = await tx.user.update({
        where: { id: userId },
        data: {
          dailyStatsDate: today,
          dailyBets: 0,
          dailyWins: 0,
          dailyFaucetClaimed: false,
          dailyQuestClaimed: false,
        },
        select: {
          id: true,
          username: true,
          balance: true,
          xp: true,
          dailyStatsDate: true,
          dailyBets: true,
          dailyWins: true,
          dailyFaucetClaimed: true,
          dailyQuestClaimed: true,
        },
      });
    }

    if (action === 'faucet') {
      if (current.dailyFaucetClaimed) {
        return {
          error: 'Daily faucet already claimed. Come back tomorrow.' as const,
          balance: current.balance,
          xp: current.xp,
          daily: {
            date: current.dailyStatsDate,
            bets: current.dailyBets,
            wins: current.dailyWins,
            faucetClaimed: current.dailyFaucetClaimed,
            questClaimed: current.dailyQuestClaimed,
          },
        };
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { increment: DAILY_FAUCET_REWARD },
          xp: { increment: 120 },
          dailyFaucetClaimed: true,
        },
        select: {
          username: true,
          balance: true,
          xp: true,
          dailyStatsDate: true,
          dailyBets: true,
          dailyWins: true,
          dailyFaucetClaimed: true,
          dailyQuestClaimed: true,
        },
      });

      return {
        username: updated.username,
        balance: updated.balance,
        xp: updated.xp,
        daily: {
          date: updated.dailyStatsDate,
          bets: updated.dailyBets,
          wins: updated.dailyWins,
          faucetClaimed: updated.dailyFaucetClaimed,
          questClaimed: updated.dailyQuestClaimed,
        },
      };
    }

    if (action === 'bet' && current.balance < amount) {
      return {
        error: 'Insufficient balance' as const,
        balance: current.balance,
        xp: current.xp,
        daily: {
          date: current.dailyStatsDate,
          bets: current.dailyBets,
          wins: current.dailyWins,
          faucetClaimed: current.dailyFaucetClaimed,
          questClaimed: current.dailyQuestClaimed,
        },
      };
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: action === 'win' || action === 'refund' ? amount : -amount,
        },
        xp: {
          increment: action === 'win' ? 10 : action === 'bet' ? 5 : 0,
        },
        dailyBets: action === 'bet' ? { increment: 1 } : undefined,
        dailyWins: action === 'win' ? { increment: 1 } : undefined,
      },
      select: {
        username: true,
        balance: true,
        xp: true,
        dailyStatsDate: true,
        dailyBets: true,
        dailyWins: true,
        dailyFaucetClaimed: true,
        dailyQuestClaimed: true,
      },
    });

    return {
      username: updated.username,
      balance: updated.balance,
      xp: updated.xp,
      daily: {
        date: updated.dailyStatsDate,
        bets: updated.dailyBets,
        wins: updated.dailyWins,
        faucetClaimed: updated.dailyFaucetClaimed,
        questClaimed: updated.dailyQuestClaimed,
      },
    };
  });

  if ('error' in result) {
    return NextResponse.json(
      {
        error: result.error,
        balance: result.balance ?? 0,
        xp: result.xp ?? 0,
        daily: result.daily,
      },
      { status: 400 }
    );
  }

  if (amount >= 5000) {
    void notifyLeaderboardRefresh({
      amount,
      reason: action,
    });
  }

  if (action === 'win' && amount >= 5000 && result.username) {
    void notifyGlobalWinMessage({
      username: result.username,
      amount,
    });
  }

  return NextResponse.json({ balance: result.balance, xp: result.xp, daily: result.daily });
}
