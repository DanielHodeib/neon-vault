import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type UserRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'SUPPORT' | 'USER';

const ROLE_SET = new Set<UserRole>(['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'USER']);

function normalizeRole(value: unknown): UserRole {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : 'USER';
  return ROLE_SET.has(role as UserRole) ? (role as UserRole) : 'USER';
}

function canAccessAdminPanel(role: UserRole) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MODERATOR';
}

function buildPermissions(role: UserRole) {
  return {
    systemFinance: role === 'OWNER',
    userManagement: role === 'OWNER' || role === 'ADMIN',
    moderationLogs: role === 'OWNER' || role === 'ADMIN' || role === 'MODERATOR',
    canManageRoles: role === 'OWNER' || role === 'ADMIN',
  };
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ isAdmin: false, role: 'USER', canAccessAdminPanel: false, permissions: buildPermissions('USER') }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const role = normalizeRole(user?.role);
  const permissions = buildPermissions(role);
  const hasPanel = canAccessAdminPanel(role);

  return NextResponse.json({
    isAdmin: hasPanel,
    userId,
    role,
    canAccessAdminPanel: hasPanel,
    permissions,
  });
}
