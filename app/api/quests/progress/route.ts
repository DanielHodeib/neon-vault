import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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
      weekly_claimed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { event?: string; count?: number };
  try {
    payload = (await request.json()) as { event?: string; count?: number };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (payload.event !== 'slots_spin') {
    return NextResponse.json({ error: 'Unsupported quest progress event.' }, { status: 400 });
  }

  const count = Number.isFinite(Number(payload.count)) ? Math.max(1, Math.floor(Number(payload.count))) : 1;
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
     SET daily_slots_rounds = CASE
           WHEN daily_date <> ? THEN ?
           ELSE daily_slots_rounds + ?
         END,
         daily_claimed = CASE WHEN daily_date <> ? THEN 0 ELSE daily_claimed END,
         daily_date = CASE WHEN daily_date <> ? THEN ? ELSE daily_date END,
         weekly_slots_rounds = CASE
           WHEN weekly_date <> ? THEN ?
           ELSE weekly_slots_rounds + ?
         END,
         weekly_claimed = CASE WHEN weekly_date <> ? THEN 0 ELSE weekly_claimed END,
         weekly_date = CASE WHEN weekly_date <> ? THEN ? ELSE weekly_date END,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    today,
    count,
    count,
    today,
    today,
    today,
    week,
    count,
    count,
    week,
    week,
    week,
    userId
  );

  return NextResponse.json({ ok: true });
}
