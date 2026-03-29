import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = String(session?.user?.role ?? '').toUpperCase();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['OWNER', 'ADMIN', 'SUPPORT'].includes(userRole)) {
    return NextResponse.json({ error: 'Forbidden: only OWNER, ADMIN or SUPPORT can delete tickets.' }, { status: 403 });
  }

  const { ticketId } = await params;

  if (!ticketId || typeof ticketId !== 'string') {
    return NextResponse.json({ error: 'Invalid ticket ID.' }, { status: 400 });
  }

  try {
    await prisma.ticket.delete({ where: { id: ticketId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : 'Unknown deletion error.';
    console.error('Deletion failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
