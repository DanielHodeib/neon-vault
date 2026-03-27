import { NextResponse } from 'next/server';
import { TicketStatus } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          content: true,
          createdAt: true,
          isStaffReply: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, tickets });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { subject?: string; category?: string; content?: string };
  try {
    payload = (await request.json()) as { subject?: string; category?: string; content?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const subject = String(payload.subject ?? '').trim().slice(0, 140);
  const category = String(payload.category ?? '').trim().slice(0, 60);
  const content = String(payload.content ?? '').trim().slice(0, 4000);

  if (!subject || !category || !content) {
    return NextResponse.json({ error: 'Subject, category and message are required.' }, { status: 400 });
  }

  const ticket = await prisma.ticket.create({
    data: {
      userId,
      subject,
      category,
      status: TicketStatus.OPEN,
      messages: {
        create: {
          senderId: userId,
          content,
          isStaffReply: false,
        },
      },
    },
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, ticket }, { status: 201 });
}
