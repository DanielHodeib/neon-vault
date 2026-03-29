import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { notifyGlobalWinMessage, notifyLeaderboardRefresh } from '@/lib/leaderboardEvents';
import { prisma } from '@/lib/prisma';
import { ensureUserQuests, incrementQuestProgress, resetExpiredUserQuests } from '@/lib/userQuests';

type WalletAction = 'bet' | 'win' | 'faucet' | 'refund';

const DAILY_FAUCET_REWARD = 5000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}


interface WalletRequestBody {
  action?: WalletAction;
  amount?: number | string;
  source?: string;
  tier?: string;
  multiplier?: number | string;
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

export async function POST(request: Request) {
  try {
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
    const amountStr = normalizeAmount(body.amount ?? 0);
    const amount = parseFloat(amountStr);
    const source = typeof body.source === 'string' ? body.source.trim().toLowerCase() : '';
    const tier = typeof body.tier === 'string' ? body.tier.trim().toLowerCase() : '';
    const multiplier = Number.isFinite(Number(body.multiplier)) ? Number(body.multiplier) : 0;

    if (!action || !['bet', 'win', 'faucet', 'refund'].includes(action)) {
      return NextResponse.json({ error: 'Invalid wallet action' }, { status: 400 });
    }

    if (action !== 'faucet' && amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const today = todayKey();
      await ensureUserQuests(tx, userId);
      await resetExpiredUserQuests(tx, userId);

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
            balance: addBalances(current.balance, DAILY_FAUCET_REWARD),
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

      if (action === 'bet' && parseFloat(current.balance) < amount) {
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

      const newBalance = action === 'win' || action === 'refund' 
        ? addBalances(current.balance, amount)
        : subtractBalances(current.balance, amount);

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          balance: newBalance,
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

      if (action === 'bet') {
        await incrementQuestProgress(tx, userId, 'daily_bet_actions', 1);
        await incrementQuestProgress(tx, userId, 'weekly_bet_actions', 1);
      }

      if (action === 'win') {
        await incrementQuestProgress(tx, userId, 'daily_win_actions', 1);
        await incrementQuestProgress(tx, userId, 'weekly_win_actions', 1);
      }

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

    if (typeof result.error === 'string') {
      const status =
        result.error === 'User not found'
          ? 404
          : result.error === 'Insufficient balance' || result.error.includes('Daily faucet')
            ? 400
            : 400;

      if (status === 400) {
        console.warn(`[wallet] 400 action=${action} amount=${amount} userId=${userId} reason=${result.error}`);
      }

      return NextResponse.json(
        {
          error: result.error,
          balance: result.balance,
          xp: result.xp,
          daily: result.daily,
        },
        { status }
      );
    }

    if (amount >= 5000) {
      void notifyLeaderboardRefresh({
        amount,
        reason: action,
      });
    }

    const shouldBroadcastWinToChat =
      action === 'win' &&
      Boolean(result.username) &&
      source === 'slots' &&
      (tier === 'jackpot' || multiplier >= 10);

    if (shouldBroadcastWinToChat && result.username) {
      void notifyGlobalWinMessage({
        username: result.username,
        amount,
        source,
        tier,
        multiplier,
      });
    }

    return NextResponse.json({ balance: result.balance, xp: result.xp, daily: result.daily });
  } catch (error) {
    console.error('Wallet POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process wallet action.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
