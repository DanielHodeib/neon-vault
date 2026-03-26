import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const DAILY_BETS_TARGET = 12;
const DAILY_WINS_TARGET = 4;
const DAILY_SLOTS_TARGET = 25;

const WEEKLY_SLOTS_TARGET = 140;
const WEEKLY_BET_ACTIONS_TARGET = 120;
const WEEKLY_WIN_ACTIONS_TARGET = 30;

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

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayKey();
  const week = weekKey();

  await ensureQuestTable();

  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO quest_progress (user_id, daily_date, weekly_date) VALUES (?, ?, ?)`,
    userId,
    today,
    week
  );

  await prisma.$executeRawUnsafe(
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
    prisma.$queryRawUnsafe(
      `SELECT user_id, daily_date, daily_slots_rounds, daily_claimed, weekly_date, weekly_slots_rounds, weekly_bet_actions, weekly_win_actions, weekly_claimed
     FROM quest_progress
     WHERE user_id = ?
     LIMIT 1`,
      userId
    ) as Promise<
      Array<{
    user_id: string;
    daily_date: string;
    daily_slots_rounds: number;
    daily_claimed: number;
    weekly_date: string;
    weekly_slots_rounds: number;
    weekly_bet_actions: number;
    weekly_win_actions: number;
    weekly_claimed: number;
  }>
    >,
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        dailyBets: true,
        dailyWins: true,
      },
    }),
  ]);

  const row = rows[0];
  if (!row || !user) {
    return NextResponse.json({ error: 'Quest data unavailable.' }, { status: 404 });
  }

  const dailyObjectives = [
    {
      id: 'daily_bets',
      label: 'Place bets',
      progress: user.dailyBets,
      target: DAILY_BETS_TARGET,
      complete: user.dailyBets >= DAILY_BETS_TARGET,
    },
    {
      id: 'daily_wins',
      label: 'Win rounds',
      progress: user.dailyWins,
      target: DAILY_WINS_TARGET,
      complete: user.dailyWins >= DAILY_WINS_TARGET,
    },
    {
      id: 'daily_slots',
      label: 'Slots spins',
      progress: row.daily_slots_rounds,
      target: DAILY_SLOTS_TARGET,
      complete: row.daily_slots_rounds >= DAILY_SLOTS_TARGET,
    },
  ];

  const weeklyObjectives = [
    {
      id: 'weekly_slots',
      label: 'Slots spins this week',
      progress: row.weekly_slots_rounds,
      target: WEEKLY_SLOTS_TARGET,
      complete: row.weekly_slots_rounds >= WEEKLY_SLOTS_TARGET,
    },
    {
      id: 'weekly_bets',
      label: 'Bet actions this week',
      progress: row.weekly_bet_actions,
      target: WEEKLY_BET_ACTIONS_TARGET,
      complete: row.weekly_bet_actions >= WEEKLY_BET_ACTIONS_TARGET,
    },
    {
      id: 'weekly_wins',
      label: 'Win actions this week',
      progress: row.weekly_win_actions,
      target: WEEKLY_WIN_ACTIONS_TARGET,
      complete: row.weekly_win_actions >= WEEKLY_WIN_ACTIONS_TARGET,
    },
  ];

  return NextResponse.json({
    daily: {
      date: row.daily_date,
      objectives: dailyObjectives,
      claimed: row.daily_claimed === 1,
      complete: dailyObjectives.every((objective) => objective.complete),
      reward: 3000,
      xpReward: 420,
    },
    weekly: {
      date: row.weekly_date,
      objectives: weeklyObjectives,
      claimed: row.weekly_claimed === 1,
      complete: weeklyObjectives.every((objective) => objective.complete),
      reward: 18000,
      xpReward: 1800,
    },
  });
}
