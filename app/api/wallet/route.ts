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
  const s = typeof raw === 'number' ? raw.toString() : String(raw ?? '0');
  const m = /^\s*-?\d+(?:\.\d{0,})?\s*$/.exec(s);
  if (!m) return '0.00';

  const cents = toCents(s);
  if (cents <= 0n || cents > BigInt(MAX_WALLET_AMOUNT) * 100n) return '0.00';

  return centsToString(cents);
}

function addBalances(balance: string | number, amount: string | number): string {
  const b = typeof balance === 'object' && balance && 'toString' in (balance as any) ? String((balance as any).toString()) : String(balance ?? '0');
  const a = String(amount ?? '0');
  return centsToString(toCents(b) + toCents(a));
}

function subtractBalances(balance: string | number, amount: string | number): string {
  const b = typeof balance === 'object' && balance && 'toString' in (balance as any) ? String((balance as any).toString()) : String(balance ?? '0');
  const a = String(amount ?? '0');
  const result = toCents(b) - toCents(a);
  return centsToString(result < 0n ? 0n : result);
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
            balance: typeof current.balance === 'object' && current.balance && 'toString' in (current.balance as any) ? String((current.balance as any).toString()) : String(current.balance ?? '0'),
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
          balance: typeof updated.balance === 'object' && updated.balance && 'toString' in (updated.balance as any) ? String((updated.balance as any).toString()) : String(updated.balance ?? '0'),
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

      if (action === 'bet') {
        const balCents = toCents(typeof current.balance === 'object' && current.balance && 'toString' in (current.balance as any) ? String((current.balance as any).toString()) : String(current.balance ?? '0'));
        const amtCents = toCents(amountStr);
        if (balCents < amtCents) {
          return {
            error: 'Insufficient balance' as const,
            balance: typeof current.balance === 'object' && current.balance && 'toString' in (current.balance as any) ? String((current.balance as any).toString()) : String(current.balance ?? '0'),
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
        balance: typeof updated.balance === 'object' && updated.balance && 'toString' in (updated.balance as any) ? String((updated.balance as any).toString()) : String(updated.balance ?? '0'),
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
