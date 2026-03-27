import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const STAFF_ROLES = new Set(['SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER']);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ticketId } = await params;
  const normalizedTicketId = String(ticketId ?? '').trim();
  if (!normalizedTicketId) {
    return NextResponse.json({ error: 'ticketId is required.' }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const ticket = await prisma.ticket.findUnique({
    where: { id: normalizedTicketId },
    select: {
      id: true,
      userId: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { username: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          content: true,
          isStaffReply: true,
          createdAt: true,
          senderId: true,
          sender: { select: { username: true, role: true } },
        },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
  }

  const isStaff = STAFF_ROLES.has(String(currentUser?.role ?? '').toUpperCase());
  if (!isStaff && ticket.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, ticket });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ticketId } = await params;
  const normalizedTicketId = String(ticketId ?? '').trim();
  if (!normalizedTicketId) {
    return NextResponse.json({ error: 'ticketId is required.' }, { status: 400 });
  }

  let payload: { content?: string };
  try {
    payload = (await request.json()) as { content?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const content = String(payload.content ?? '').trim().slice(0, 4000);
  if (!content) {
    return NextResponse.json({ error: 'Message content is required.' }, { status: 400 });
  }

  const [ticket, currentUser] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: normalizedTicketId }, select: { id: true, userId: true, status: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
  }

  const isStaff = STAFF_ROLES.has(String(currentUser?.role ?? '').toUpperCase());
  if (!isStaff && ticket.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = isStaff ? 'ANSWERED' : ticket.status === 'CLOSED' ? 'OPEN' : ticket.status;

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: {
        ticketId: normalizedTicketId,
        senderId: userId,
        content,
        isStaffReply: isStaff,
      },
      select: {
        id: true,
        content: true,
        isStaffReply: true,
        createdAt: true,
        senderId: true,
        sender: { select: { username: true, role: true } },
      },
    });

    await tx.ticket.update({
      where: { id: normalizedTicketId },
      data: { status },
    });

    return created;
  });

  return NextResponse.json({ ok: true, message, status });
}
