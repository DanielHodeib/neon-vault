import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    avatarUrl?: string;
    bannerUrl?: string;
    bio?: string;
    favoriteGame?: string;
    privacyShowBalance?: boolean;
    publicGameHistory?: boolean;
  };

  const data: { avatarUrl?: string | null; bannerUrl?: string | null; bio?: string | null } = {};
  const settingsData: {
    bio?: string;
    favoriteGame?: string;
    privacyShowBalance?: boolean;
    publicGameHistory?: boolean;
  } = {};

  if ('avatarUrl' in body) data.avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim().slice(0, 500) || null : null;
  if ('bannerUrl' in body) data.bannerUrl = typeof body.bannerUrl === 'string' ? body.bannerUrl.trim().slice(0, 500) || null : null;
  if ('bio' in body) {
    const nextBio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 160) : '';
    data.bio = nextBio || null;
    settingsData.bio = nextBio;
  }
  if ('favoriteGame' in body) {
    settingsData.favoriteGame = typeof body.favoriteGame === 'string'
      ? body.favoriteGame.trim().slice(0, 48) || 'Unknown'
      : 'Unknown';
  }
  if ('privacyShowBalance' in body) {
    settingsData.privacyShowBalance = Boolean(body.privacyShowBalance);
  }
  if ('publicGameHistory' in body) {
    settingsData.publicGameHistory = Boolean(body.publicGameHistory);
  }

  const [user, settings] = await Promise.all([
    prisma.user.update({ where: { id: userId }, data, select: { avatarUrl: true, bannerUrl: true, bio: true } }),
    prisma.settings.upsert({
      where: { userId },
      update: settingsData,
      create: {
        userId,
        soundEnabled: true,
        theme: 'slate',
        selectedRankTag: 'BRONZE',
        publicProfile: true,
        bio: settingsData.bio ?? '',
        favoriteGame: settingsData.favoriteGame ?? 'Unknown',
        privacyShowBalance: settingsData.privacyShowBalance ?? false,
        publicGameHistory: settingsData.publicGameHistory ?? false,
      },
      select: {
        favoriteGame: true,
        privacyShowBalance: true,
        publicGameHistory: true,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, user, settings });
}
