import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canUseRankTag, getRankInfo, isRankTag, type RankTag } from '@/lib/ranks';

type Theme = 'slate' | 'steel' | 'sunset' | 'ocean' | 'matrix';

const ALLOWED_THEMES = new Set<Theme>(['slate', 'steel', 'sunset', 'ocean', 'matrix']);

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
      selectedRankTag: 'BRONZE',
      publicProfile: true,
      bio: '',
    },
    select: {
      soundEnabled: true,
      theme: true,
      selectedRankTag: true,
      publicProfile: true,
      bio: true,
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

  let payload: { soundEnabled?: boolean; theme?: Theme; selectedRankTag?: RankTag; publicProfile?: boolean; bio?: string };
  try {
    payload = (await request.json()) as {
      soundEnabled?: boolean;
      theme?: Theme;
      selectedRankTag?: RankTag;
      publicProfile?: boolean;
      bio?: string;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const nextTheme = payload.theme;
  if (nextTheme && !ALLOWED_THEMES.has(nextTheme)) {
    return NextResponse.json({ error: 'Invalid theme.' }, { status: 400 });
  }

  const bio = typeof payload.bio === 'string' ? payload.bio.trim().slice(0, 240) : undefined;
  const selectedRankTag = typeof payload.selectedRankTag === 'string' ? payload.selectedRankTag : undefined;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, balance: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (selectedRankTag) {
    if (!isRankTag(selectedRankTag)) {
      return NextResponse.json({ error: 'Invalid rank tag.' }, { status: 400 });
    }

    const { level } = getRankInfo(user.xp, user.balance);
    if (!canUseRankTag(level, user.balance, selectedRankTag)) {
      return NextResponse.json({ error: 'Rank is still locked for your level.' }, { status: 400 });
    }
  }

  const settings = await prisma.settings.upsert({
    where: { userId },
    update: {
      ...(typeof payload.soundEnabled === 'boolean' ? { soundEnabled: payload.soundEnabled } : {}),
      ...(nextTheme ? { theme: nextTheme } : {}),
      ...(selectedRankTag ? { selectedRankTag } : {}),
      ...(typeof payload.publicProfile === 'boolean' ? { publicProfile: payload.publicProfile } : {}),
      ...(typeof bio === 'string' ? { bio } : {}),
    },
    create: {
      userId,
      soundEnabled: payload.soundEnabled ?? true,
      theme: nextTheme ?? 'slate',
      selectedRankTag: selectedRankTag ?? 'BRONZE',
      publicProfile: payload.publicProfile ?? true,
      bio: bio ?? '',
    },
    select: {
      soundEnabled: true,
      theme: true,
      selectedRankTag: true,
      publicProfile: true,
      bio: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ settings });
}
