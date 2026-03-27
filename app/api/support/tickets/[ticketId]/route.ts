import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ticketId } = await params;

  if (!ticketId || typeof ticketId !== 'string') {
    return NextResponse.json({ error: 'Invalid ticket ID.' }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { userId: true },
  });

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
  }

  // Only allow deletion by:
  // 1. The ticket owner (user who created it)
  // 2. Staff members (SUPPORT, MODERATOR, ADMIN, OWNER)
  const isOwner = ticket.userId === userId;
  const isStaff = ['SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER'].includes(String(userRole ?? '').toUpperCase());

  if (!isOwner && !isStaff) {
    return NextResponse.json({ error: 'Forbidden: you cannot delete this ticket.' }, { status: 403 });
  }

  // Delete ticket and cascade delete all messages
  await prisma.ticket.delete({
    where: { id: ticketId },
  });

  return NextResponse.json({ ok: true });
}
