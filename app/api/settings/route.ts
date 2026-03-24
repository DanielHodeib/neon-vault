import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type Theme = 'slate' | 'steel';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await prisma.settings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      soundEnabled: true,
      theme: 'slate',
    },
    select: {
      soundEnabled: true,
      theme: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { soundEnabled?: boolean; theme?: Theme };
  try {
    payload = (await request.json()) as { soundEnabled?: boolean; theme?: Theme };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const nextTheme = payload.theme;
  if (nextTheme && nextTheme !== 'slate' && nextTheme !== 'steel') {
    return NextResponse.json({ error: 'Invalid theme.' }, { status: 400 });
  }

  const settings = await prisma.settings.upsert({
    where: { userId },
    update: {
      ...(typeof payload.soundEnabled === 'boolean' ? { soundEnabled: payload.soundEnabled } : {}),
      ...(nextTheme ? { theme: nextTheme } : {}),
    },
    create: {
      userId,
      soundEnabled: payload.soundEnabled ?? true,
      theme: nextTheme ?? 'slate',
    },
    select: {
      soundEnabled: true,
      theme: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ settings });
}
