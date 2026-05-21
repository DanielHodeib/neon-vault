import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  buildAdminPermissions,
  canAccessAdminPanel,
  normalizeRole,
} from '@/lib/adminAccess';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { isAdmin: false, role: 'USER', canAccessAdminPanel: false, permissions: buildAdminPermissions('USER') },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, role: true },
  });

  const role = normalizeRole(user?.role);
  const permissions = buildAdminPermissions(role);
  const hasPanel = canAccessAdminPanel(role);

  return NextResponse.json({
    isAdmin: hasPanel,
    userId,
    username: user?.username ?? '',
    role,
    canAccessAdminPanel: hasPanel,
    permissions,
  });
}
