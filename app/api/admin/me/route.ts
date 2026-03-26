import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  const username = session?.user?.name ?? '';

  if (!userId) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  if (username !== 'Daniel') {
    return NextResponse.json({ isAdmin: false }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, role: true },
  });

  const isAdmin = Boolean(user && user.username === 'Daniel' && user.role === 'ADMIN');
  return NextResponse.json({ isAdmin });
}
