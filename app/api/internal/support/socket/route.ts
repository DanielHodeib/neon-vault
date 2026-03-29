import { NextResponse } from 'next/server';
import { TicketStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';

type InternalSupportAction = 'create_ticket' | 'send_ticket_message' | 'update_ticket_status';

const STAFF_ROLES = new Set(['SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER']);

function isAuthorizedInternalRequest(request: Request) {
  const token = (process.env.INTERNAL_API_TOKEN ?? '').trim();
  if (!token) {
    return true;
  }

  const headerToken = (request.headers.get('x-internal-token') ?? '').trim();
  return headerToken.length > 0 && headerToken === token;
}

export async function POST(request: Request) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized internal request.' }, { status: 401 });
  }

  let payload: {
    action?: InternalSupportAction;
    senderUsername?: string;
    subject?: string;
    category?: string;
    content?: string;
    ticketId?: string;
    status?: string;
  };

  try {
    payload = (await request.json()) as {
      action?: InternalSupportAction;
      senderUsername?: string;
      subject?: string;
      category?: string;
      content?: string;
      ticketId?: string;
      status?: string;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const action = payload.action;
  const senderUsername = String(payload.senderUsername ?? '').trim();

  if (!action || !senderUsername) {
    return NextResponse.json({ error: 'action and senderUsername are required.' }, { status: 400 });
  }

  const sender = await prisma.user.findUnique({
    where: { username: senderUsername },
    select: { id: true, role: true },
  });

  if (!sender) {
    return NextResponse.json({ error: 'Sender user not found.' }, { status: 404 });
  }

  if (action === 'create_ticket') {
    const subject = String(payload.subject ?? '').trim().slice(0, 140);
    const category = String(payload.category ?? '').trim().slice(0, 60);
    const content = String(payload.content ?? '').trim().slice(0, 4000);

    if (!subject || !category || !content) {
      return NextResponse.json({ error: 'subject, category and content are required.' }, { status: 400 });
    }

    const ticket = await prisma.ticket.create({
      data: {
        userId: sender.id,
        subject,
        category,
        status: TicketStatus.OPEN,
        messages: {
          create: {
            senderId: sender.id,
            content,
            isStaffReply: false,
          },
        },
      },
      select: {
        id: true,
        userId: true,
        subject: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, ticket });
  }

  if (action === 'send_ticket_message') {
    const ticketId = String(payload.ticketId ?? '').trim();
    const content = String(payload.content ?? '').trim().slice(0, 4000);

    if (!ticketId || !content) {
      return NextResponse.json({ error: 'ticketId and content are required.' }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, status: true, user: { select: { username: true } } },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    const isStaff = STAFF_ROLES.has(String(sender.role ?? '').toUpperCase());
    if (!isStaff && sender.id !== ticket.userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const nextStatus = isStaff ? TicketStatus.ANSWERED : ticket.status === TicketStatus.CLOSED ? TicketStatus.OPEN : ticket.status;

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({
        data: {
          ticketId,
          senderId: sender.id,
          content,
          isStaffReply: isStaff,
        },
        select: {
          id: true,
          ticketId: true,
          content: true,
          isStaffReply: true,
          createdAt: true,
          senderId: true,
          sender: { select: { username: true, role: true } },
        },
      });

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: nextStatus },
      });

      return created;
    });

    return NextResponse.json({
      ok: true,
      message,
      ticketId,
      status: nextStatus,
      ticketUserId: ticket.userId,
      ticketOwnerUsername: ticket.user?.username,
    });
  }

  if (action === 'update_ticket_status') {
    const ticketId = String(payload.ticketId ?? '').trim();
    const status = String(payload.status ?? '').trim().toUpperCase();
    const isStaff = STAFF_ROLES.has(String(sender.role ?? '').toUpperCase());

    if (!isStaff) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    if (!ticketId || !Object.values(TicketStatus).includes(status as TicketStatus)) {
      return NextResponse.json({ error: 'Valid ticketId and status are required.' }, { status: 400 });
    }

    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: status as TicketStatus },
      select: {
        id: true,
        userId: true,
        status: true,
        updatedAt: true,
        user: { select: { username: true } },
      },
    });

    return NextResponse.json({ ok: true, ticket });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
