import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';
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

  if (!['OWNER', 'ADMIN', 'SUPPORT', 'MODERATOR'].includes(userRole)) {
    return NextResponse.json({ error: 'Forbidden: only OWNER, ADMIN, SUPPORT or MODERATOR can delete tickets.' }, { status: 403 });
  }

  const { ticketId } = await params;

  if (!ticketId || typeof ticketId !== 'string') {
    return NextResponse.json({ error: 'Invalid ticket ID.' }, { status: 400 });
  }

  try {
    console.log('[support.delete] requested', { ticketId, userId, userRole });
    console.log('[support.delete] deleting linked ticket messages', { ticketId });
    await prisma.ticketMessage.deleteMany({ where: { ticketId } });
    console.log('[support.delete] ticket messages deleted', { ticketId });

    console.log('[support.delete] deleting ticket record', { ticketId });
    const deleted = await prisma.ticket.deleteMany({ where: { id: ticketId } });
    if (deleted.count === 0) {
      console.log('[support.delete] ticket already missing', { ticketId });
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }
    console.log('[support.delete] ticket deleted', { ticketId });

    const broadcastUrl = `${getGameServerUrl()}/internal/support/ticket-deleted`;
    console.log('[support.delete] broadcasting ticket_deleted', { ticketId, broadcastUrl });
    await fetch(broadcastUrl, {
      method: 'POST',
      headers: getInternalHeaders(),
      body: JSON.stringify({ ticketId, deletedBy: userId, deletedRole: userRole }),
      cache: 'no-store',
    }).catch((error) => {
      console.error('[support.delete] broadcast failed', error);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown deletion error.';
    console.error('Deletion failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
