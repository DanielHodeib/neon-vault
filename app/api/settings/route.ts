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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clanTag: true },
  });

  return NextResponse.json({ settings: { ...settings, clanTag: user?.clanTag ?? null } });
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload: {
      soundEnabled?: boolean;
      theme?: Theme;
      selectedRankTag?: RankTag;
      publicProfile?: boolean;
      bio?: string;
      clanTag?: string | null;
    };
    try {
      payload = (await request.json()) as {
        soundEnabled?: boolean;
        theme?: Theme;
        selectedRankTag?: RankTag;
        publicProfile?: boolean;
        bio?: string;
        clanTag?: string | null;
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
    const clanTag =
      payload.clanTag === null
        ? null
        : typeof payload.clanTag === 'string'
          ? payload.clanTag.trim().slice(0, 5).toUpperCase() || null
          : undefined;

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

      const hasDanielFriend = selectedRankTag === 'BALLER'
        ? Boolean(
            await prisma.friendship.findFirst({
              where: {
                status: 'accepted',
                OR: [
                  { userId, friend: { username: 'Daniel' } },
                  { friendId: userId, user: { username: 'Daniel' } },
                ],
              },
              select: { id: true },
            })
          )
        : false;

      const { level } = getRankInfo(user.xp, user.balance);
      if (!canUseRankTag(level, user.balance, selectedRankTag, { hasDanielFriend })) {
        if (selectedRankTag === 'BALLER') {
          return NextResponse.json({ error: 'BALLER is only available if you are friends with Daniel.' }, { status: 400 });
        }
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

    const updatedUser =
      clanTag === undefined
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { clanTag: true },
          })
        : await prisma.user.update({
            where: { id: userId },
            data: { clanTag },
            select: { clanTag: true },
          });

    return NextResponse.json({ settings: { ...settings, clanTag: updatedUser?.clanTag ?? null } });
  } catch (error) {
    console.error('Settings PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update settings.' }, { status: 500 });
  }
}
