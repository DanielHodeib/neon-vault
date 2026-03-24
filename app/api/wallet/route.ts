import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type WalletAction = 'bet' | 'win' | 'faucet' | 'quest' | 'refund';

const DAILY_FAUCET_REWARD = 5000;
const DAILY_QUEST_REWARD = 3000;
const QUEST_TARGET_BETS = 5;
const QUEST_TARGET_WINS = 2;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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

  if (!action || !['bet', 'win', 'faucet', 'quest', 'refund'].includes(action)) {
    return NextResponse.json({ error: 'Invalid wallet action' }, { status: 400 });
  }

  if (action !== 'faucet' && action !== 'quest' && amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const today = todayKey();

    let current = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
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

    if (action === 'quest') {
      if (current.dailyQuestClaimed) {
        return {
          error: 'Daily quest reward already claimed.' as const,
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

      const complete =
        current.dailyBets >= QUEST_TARGET_BETS &&
        current.dailyWins >= QUEST_TARGET_WINS &&
        current.dailyFaucetClaimed;

      if (!complete) {
        return {
          error: 'Daily quests not complete yet.' as const,
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
          balance: { increment: DAILY_QUEST_REWARD },
          xp: { increment: 250 },
          dailyQuestClaimed: true,
        },
        select: {
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

  return NextResponse.json({ balance: result.balance, xp: result.xp, daily: result.daily });
}
