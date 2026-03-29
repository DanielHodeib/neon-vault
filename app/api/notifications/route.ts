import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type NotificationMutationPayload = {
  ids?: string[];
  markAll?: boolean;
  clearAll?: boolean;
};

function parseIds(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
}

async function markNotificationsRead(userId: string, request: Request) {
  let payload: NotificationMutationPayload;
  try {
    payload = (await request.json()) as NotificationMutationPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const ids = parseIds(payload.ids);

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

async function deleteNotifications(userId: string, request: Request) {
  let payload: NotificationMutationPayload;
  try {
    payload = (await request.json()) as NotificationMutationPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const ids = parseIds(payload.ids);

  if (payload.clearAll) {
    await prisma.notification.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true });
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids are required when clearAll is false.' }, { status: 400 });
  }

  await prisma.notification.deleteMany({
    where: {
      userId,
      id: { in: ids },
    },
  });

  return NextResponse.json({ ok: true });
}

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

  return markNotificationsRead(userId, request);
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return markNotificationsRead(userId, request);
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return deleteNotifications(userId, request);
}
