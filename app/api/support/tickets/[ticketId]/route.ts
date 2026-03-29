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
    select: { id: true },
  });

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
  }

  // Emergency policy: only SUPPORT, ADMIN, OWNER can delete tickets.
  const isStaff = ['SUPPORT', 'ADMIN', 'OWNER'].includes(String(userRole ?? '').toUpperCase());

  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden: you cannot delete this ticket.' }, { status: 403 });
  }

  // Explicitly remove messages first, then ticket, to guarantee cleanup.
  await prisma.$transaction([
    prisma.ticketMessage.deleteMany({
      where: { ticketId: ticket.id },
    }),
    prisma.ticket.delete({
      where: { id: ticket.id },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
