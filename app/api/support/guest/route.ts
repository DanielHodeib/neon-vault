import { NextResponse } from 'next/server';

import { TicketStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  let payload: { username?: string; guestContact?: string; category?: string; message?: string };

  try {
    payload = (await request.json()) as { username?: string; guestContact?: string; category?: string; message?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const username = String(payload.username ?? '').trim().slice(0, 40);
  const guestContact = String(payload.guestContact ?? '').trim().slice(0, 160);
  const category = String(payload.category ?? '').trim().slice(0, 60);
  const message = String(payload.message ?? '').trim().slice(0, 4000);

  if (!guestContact || !category || !message) {
    return NextResponse.json({ error: 'Contact, category and message are required.' }, { status: 400 });
  }

  const subject = `Guest Support: ${message.slice(0, 72)}${message.length > 72 ? '...' : ''}`;

  const ticket = await prisma.ticket.create({
    data: {
      userId: null,
      guestContact,
      guestUsername: username || null,
      category,
      subject,
      content: message,
      status: TicketStatus.OPEN,
    },
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      guestContact: true,
      guestUsername: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, ticket }, { status: 201 });
}
