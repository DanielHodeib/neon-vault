import { NextResponse } from 'next/server';
import { NotificationType } from '@prisma/client';

import { prisma } from '@/lib/prisma';

function isAuthorizedInternalRequest(request: Request) {
  const token = (process.env.INTERNAL_API_TOKEN ?? '').trim();
  if (!token) {
    return true;
  }

  const provided = (request.headers.get('x-internal-token') ?? '').trim();
  return provided.length > 0 && provided === token;
}

function normalizeType(value: unknown): NotificationType {
  const candidate = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (Object.values(NotificationType).includes(candidate as NotificationType)) {
    return candidate as NotificationType;
  }
  return NotificationType.SYSTEM;
}

export async function POST(request: Request) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized internal request.' }, { status: 401 });
  }

  let payload: {
    action?: 'create' | 'fetch' | 'mark-read' | 'delete';
    userId?: string;
    type?: string;
    title?: string;
    message?: string;
    ids?: string[];
    markAll?: boolean;
    clearAll?: boolean;
    limit?: number;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const action = String(payload.action ?? '').trim();
  const userId = String(payload.userId ?? '').trim();

  if (!action || !userId) {
    return NextResponse.json({ error: 'action and userId are required.' }, { status: 400 });
  }

  if (action === 'create') {
    const title = String(payload.title ?? '').trim().slice(0, 120);
    const message = String(payload.message ?? '').trim().slice(0, 400);
    if (!title || !message) {
      return NextResponse.json({ error: 'title and message are required.' }, { status: 400 });
    }

    const created = await prisma.notification.create({
      data: {
        userId,
        type: normalizeType(payload.type),
        title,
        message,
      },
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

    return NextResponse.json({ ok: true, notification: created });
  }

  if (action === 'fetch') {
    const limit = Math.min(100, Math.max(1, Math.floor(Number(payload.limit ?? 20))));
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
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

    return NextResponse.json({ ok: true, notifications });
  }

  if (action === 'mark-read') {
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

  if (action === 'delete') {
    const ids = Array.isArray(payload.ids)
      ? payload.ids.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (payload.clearAll) {
      await prisma.notification.deleteMany({
        where: { userId },
      });
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

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
