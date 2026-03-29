import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

function formatRemainingTime(targetDate: Date) {
  const diffMs = Math.max(0, targetDate.getTime() - Date.now());
  const totalMinutes = Math.max(1, Math.floor(diffMs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export async function POST(request: Request) {
  let payload: { username?: string; password?: string };

  try {
    payload = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const username = String(payload.username ?? '').trim();
  const password = String(payload.password ?? '');

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      isBanned: true,
      banExpiresAt: true,
      banReason: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  if (user.isBanned) {
    if (user.banExpiresAt && user.banExpiresAt.getTime() <= Date.now()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBanned: false,
          banExpiresAt: null,
          banReason: null,
        },
      });
    } else if (user.banExpiresAt) {
      const remaining = formatRemainingTime(user.banExpiresAt);
      const reason = user.banReason?.trim() || 'Unspecified';
      return NextResponse.json(
        { error: `Dein Account wurde gesperrt. Grund: ${reason}. Dauer: ${remaining}.` },
        { status: 403 }
      );
    } else {
      const reason = user.banReason?.trim() || 'Unspecified';
      return NextResponse.json(
        { error: `Dein Account wurde gesperrt. Grund: ${reason}. Dauer: Permanent.` },
        { status: 403 }
      );
    }
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
