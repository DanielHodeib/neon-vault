import { NextResponse } from 'next/server';
import { TicketStatus } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const STAFF_ROLES = new Set(['SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const isStaff = STAFF_ROLES.has(String(currentUser?.role ?? '').toUpperCase());
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ticketId } = await params;
  const normalizedTicketId = String(ticketId ?? '').trim();
  if (!normalizedTicketId) {
    return NextResponse.json({ error: 'ticketId is required.' }, { status: 400 });
  }

  let payload: { status?: string };
  try {
    payload = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const status = String(payload.status ?? '').trim().toUpperCase();
  if (!Object.values(TicketStatus).includes(status as TicketStatus)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const ticket = await prisma.ticket.update({
    where: { id: normalizedTicketId },
    data: { status: status as TicketStatus },
    select: {
      id: true,
      status: true,
      userId: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, ticket });
}
