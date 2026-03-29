import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { assertAdminAccess, canManageTarget, canUseUserManagement, normalizeRole } from '@/lib/adminAccess';

export async function POST(request: Request) {
  const access = await assertAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  if (!canUseUserManagement(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let payload: { targetId?: string; newPassword?: string };
  try {
    payload = (await request.json()) as { targetId?: string; newPassword?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const targetId = String(payload.targetId ?? '').trim();
  const newPassword = String(payload.newPassword ?? '').trim();

  if (!targetId || newPassword.length < 8) {
    return NextResponse.json({ error: 'targetId and password(min 8) are required.' }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (!canManageTarget(access.actorRole, access.adminUserId, targetId, normalizeRole(targetUser.role))) {
    return NextResponse.json({ error: 'Insufficient permission for this user.' }, { status: 403 });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash: hashedPassword },
  });

  return NextResponse.json({ ok: true });
}
