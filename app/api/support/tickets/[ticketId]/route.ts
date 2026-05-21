import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';
import { prisma } from '@/lib/prisma';

const STAFF_ROLES = new Set(['OWNER', 'ADMIN', 'SUPPORT', 'MODERATOR']);

function normalizeRole(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionRole = normalizeRole(session?.user?.role);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const dbRole = normalizeRole(currentUser?.role);
  const effectiveRole = STAFF_ROLES.has(dbRole) ? dbRole : sessionRole;

  if (!STAFF_ROLES.has(effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden: only OWNER, ADMIN, SUPPORT or MODERATOR can delete tickets.' }, { status: 403 });
  }

  const { ticketId } = await params;

  if (!ticketId || typeof ticketId !== 'string') {
    return NextResponse.json({ error: 'Invalid ticket ID.' }, { status: 400 });
  }

  try {
    console.log('[support.delete] requested', { ticketId, userId, sessionRole, dbRole, effectiveRole });
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
      body: JSON.stringify({ ticketId, deletedBy: userId, deletedRole: effectiveRole }),
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
