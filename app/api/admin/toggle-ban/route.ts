import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { assertAdminAccess, canManageTarget, canUseModeration, normalizeRole } from '@/lib/adminAccess';
import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';

export async function POST(request: Request) {
  const access = await assertAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  if (!canUseModeration(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let payload: {
    targetId?: string;
    isBanned?: boolean;
    banStatus?: boolean;
    duration?: '1h' | '24h' | '1w' | 'permanent';
    reason?: string;
  };
  try {
    payload = (await request.json()) as { targetId?: string; isBanned?: boolean };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const targetId = String(payload.targetId ?? '').trim();
  const desiredBanStatus = typeof payload.banStatus === 'boolean' ? payload.banStatus : payload.isBanned;
  const isBanned = desiredBanStatus;

  if (!targetId || typeof isBanned !== 'boolean') {
    return NextResponse.json({ error: 'targetId and banStatus/isBanned are required.' }, { status: 400 });
  }

  if (targetId === access.adminUserId && isBanned) {
    return NextResponse.json({ error: 'You cannot ban yourself.' }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (!canManageTarget(access.actorRole, access.adminUserId, targetId, normalizeRole(targetUser.role))) {
    return NextResponse.json({ error: 'Insufficient permission for this user.' }, { status: 403 });
  }

  const normalizedDuration = typeof payload.duration === 'string' ? payload.duration : 'permanent';
  const normalizedReason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 240) : '';

  let banExpiresAt: Date | null = null;
  let banReason: string | null = null;

  if (isBanned) {
    const now = Date.now();
    if (normalizedDuration === '1h') {
      banExpiresAt = new Date(now + 60 * 60 * 1000);
    } else if (normalizedDuration === '24h') {
      banExpiresAt = new Date(now + 24 * 60 * 60 * 1000);
    } else if (normalizedDuration === '1w') {
      banExpiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
    }
    banReason = normalizedReason || 'No reason provided';
  }

  await prisma.user.update({
    where: { id: targetId },
    data: isBanned
      ? {
          isBanned: true,
          banExpiresAt,
          banReason,
        }
      : {
          isBanned: false,
          banExpiresAt: null,
          banReason: null,
        },
  });

  const gameServerUrl = getGameServerUrl();
  await fetch(`${gameServerUrl}/internal/user/banned-status`, {
    method: 'POST',
    headers: getInternalHeaders(),
    body: JSON.stringify({
      userId: targetUser.id,
      username: targetUser.username,
      isBanned,
      banReason: isBanned ? banReason : null,
      banExpiresAt: isBanned ? banExpiresAt?.toISOString() ?? null : null,
      forceLogoutMessage: isBanned
        ? banExpiresAt
          ? 'You have been temporarily banned.'
          : 'You have been permanently banned.'
        : null,
    }),
    cache: 'no-store',
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    isBanned,
    banReason: isBanned ? banReason : null,
    banExpiresAt: isBanned ? banExpiresAt?.toISOString() ?? null : null,
  });
}
