import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { avatarUrl?: string; bannerUrl?: string; bio?: string };

  const data: { avatarUrl?: string | null; bannerUrl?: string | null; bio?: string | null } = {};

  if ('avatarUrl' in body) data.avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim().slice(0, 500) || null : null;
  if ('bannerUrl' in body) data.bannerUrl = typeof body.bannerUrl === 'string' ? body.bannerUrl.trim().slice(0, 500) || null : null;
  if ('bio' in body) data.bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 160) || null : null;

  const user = await prisma.user.update({ where: { id: userId }, data, select: { avatarUrl: true, bannerUrl: true, bio: true } });
  return NextResponse.json({ ok: true, user });
}
