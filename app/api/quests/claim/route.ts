import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { notifyLeaderboardRefresh } from '@/lib/leaderboardEvents';
import { prisma } from '@/lib/prisma';

const DAILY_BETS_TARGET = 12;
const DAILY_WINS_TARGET = 4;
const DAILY_SLOTS_TARGET = 25;

const WEEKLY_SLOTS_TARGET = 140;
const WEEKLY_BET_ACTIONS_TARGET = 120;
const WEEKLY_WIN_ACTIONS_TARGET = 30;

const DAILY_REWARD = 3000;
const WEEKLY_REWARD = 18000;
const DAILY_XP = 420;
const WEEKLY_XP = 1800;

function addBalances(balance: string | number, amount: string | number): string {
  const b = typeof balance === 'string' ? parseFloat(balance) : balance;
  const a = typeof amount === 'string' ? parseFloat(amount) : amount;
  return (b + a).toFixed(2);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function weekKey() {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  now.setUTCDate(now.getUTCDate() + diffToMonday);
  return now.toISOString().slice(0, 10);
}

async function ensureQuestTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS quest_progress (
      user_id TEXT PRIMARY KEY,
      daily_date TEXT NOT NULL,
      daily_slots_rounds INTEGER NOT NULL DEFAULT 0,
      daily_claimed INTEGER NOT NULL DEFAULT 0,
      weekly_date TEXT NOT NULL,
      weekly_slots_rounds INTEGER NOT NULL DEFAULT 0,
      weekly_bet_actions INTEGER NOT NULL DEFAULT 0,
      weekly_win_actions INTEGER NOT NULL DEFAULT 0,
      weekly_claimed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info(quest_progress)`)) as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));

  if (!names.has('weekly_bet_actions')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE quest_progress ADD COLUMN weekly_bet_actions INTEGER NOT NULL DEFAULT 0`);
  }

  if (!names.has('weekly_win_actions')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE quest_progress ADD COLUMN weekly_win_actions INTEGER NOT NULL DEFAULT 0`);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { period?: 'daily' | 'weekly' };
  try {
    payload = (await request.json()) as { period?: 'daily' | 'weekly' };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const period = payload.period;
  if (period !== 'daily' && period !== 'weekly') {
    return NextResponse.json({ error: 'Invalid claim period.' }, { status: 400 });
  }

  const today = todayKey();
  const week = weekKey();

  await ensureQuestTable();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(
      `INSERT OR IGNORE INTO quest_progress (user_id, daily_date, weekly_date) VALUES (?, ?, ?)`,
      userId,
      today,
      week
    );

    await tx.$executeRawUnsafe(
      `UPDATE quest_progress
       SET daily_slots_rounds = CASE WHEN daily_date <> ? THEN 0 ELSE daily_slots_rounds END,
           daily_claimed = CASE WHEN daily_date <> ? THEN 0 ELSE daily_claimed END,
           daily_date = CASE WHEN daily_date <> ? THEN ? ELSE daily_date END,
           weekly_slots_rounds = CASE WHEN weekly_date <> ? THEN 0 ELSE weekly_slots_rounds END,
           weekly_bet_actions = CASE WHEN weekly_date <> ? THEN 0 ELSE weekly_bet_actions END,
           weekly_win_actions = CASE WHEN weekly_date <> ? THEN 0 ELSE weekly_win_actions END,
           weekly_claimed = CASE WHEN weekly_date <> ? THEN 0 ELSE weekly_claimed END,
           weekly_date = CASE WHEN weekly_date <> ? THEN ? ELSE weekly_date END,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      today,
      today,
      today,
      today,
      week,
      week,
      week,
      week,
      week,
      week,
      userId
    );

    const [rows, user] = await Promise.all([
      tx.$queryRawUnsafe(
        `SELECT daily_slots_rounds, daily_claimed, weekly_slots_rounds, weekly_bet_actions, weekly_win_actions, weekly_claimed
       FROM quest_progress
       WHERE user_id = ?
       LIMIT 1`,
        userId
      ) as Promise<
        Array<{
      daily_slots_rounds: number;
      daily_claimed: number;
      weekly_slots_rounds: number;
      weekly_bet_actions: number;
      weekly_win_actions: number;
      weekly_claimed: number;
    }>
      >,
      tx.user.findUnique({
        where: { id: userId },
        select: {
          dailyBets: true,
          dailyWins: true,
          balance: true,
        },
      }),
    ]);

    const row = rows[0];
    if (!row || !user) {
      return { error: 'Quest progress missing.' as const };
    }

    const isDaily = period === 'daily';
    const claimed = isDaily ? row.daily_claimed === 1 : row.weekly_claimed === 1;
    const reward = isDaily ? DAILY_REWARD : WEEKLY_REWARD;
    const xpReward = isDaily ? DAILY_XP : WEEKLY_XP;

    const dailyComplete =
      user.dailyBets >= DAILY_BETS_TARGET &&
      user.dailyWins >= DAILY_WINS_TARGET &&
      row.daily_slots_rounds >= DAILY_SLOTS_TARGET;

    const weeklyComplete =
      row.weekly_slots_rounds >= WEEKLY_SLOTS_TARGET &&
      row.weekly_bet_actions >= WEEKLY_BET_ACTIONS_TARGET &&
      row.weekly_win_actions >= WEEKLY_WIN_ACTIONS_TARGET;

    if (claimed) {
      return { error: `${isDaily ? 'Daily' : 'Weekly'} reward already claimed.` as const };
    }

    if ((isDaily && !dailyComplete) || (!isDaily && !weeklyComplete)) {
      return { error: `${isDaily ? 'Daily' : 'Weekly'} quest not complete yet.` as const };
    }

    if (isDaily) {
      await tx.$executeRawUnsafe(
        `UPDATE quest_progress SET daily_claimed = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        userId
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE quest_progress SET weekly_claimed = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        userId
      );
    }

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        balance: addBalances(user.balance ?? '0.00', reward),
        xp: { increment: xpReward },
      },
      select: { balance: true, xp: true },
    });

    return {
      ok: true as const,
      reward,
      xpReward,
      balance: updatedUser.balance,
      xp: updatedUser.xp,
    };
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.reward >= 5000) {
    void notifyLeaderboardRefresh({
      amount: result.reward,
      reason: 'quest-claim',
    });
  }

  return NextResponse.json(result);
}
