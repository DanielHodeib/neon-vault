import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureUserQuests, incrementQuestProgress, resetExpiredUserQuests } from '@/lib/userQuests';

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
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await ensureUserQuests(tx, userId);
    await resetExpiredUserQuests(tx, userId);
    await incrementQuestProgress(tx, userId, 'daily_slots_spins', count);
    await incrementQuestProgress(tx, userId, 'weekly_slots_spins', count);
  });

  return NextResponse.json({ ok: true });
}
