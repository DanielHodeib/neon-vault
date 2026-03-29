import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ notifications: [] }, { status: 401 });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      message: true,
      isRead: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ notifications: notifications ?? [] }, { status: 200 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { ids?: string[]; markAll?: boolean };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const ids = Array.isArray(payload.ids)
    ? payload.ids.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (payload.markAll) {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids are required when markAll is false.' }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: {
      userId,
      id: { in: ids },
    },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true });
}
