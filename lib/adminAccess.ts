import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type UserRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'SUPPORT' | 'USER';

export const ROLE_SET = new Set<UserRole>(['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'USER']);

const ADMIN_MANAGEMENT_ROLES = new Set<UserRole>(['OWNER', 'ADMIN', 'MODERATOR']);

export type AdminPermissions = {
  systemFinance: boolean;
  userManagement: boolean;
  moderationLogs: boolean;
  canManageRoles: boolean;
  helpDesk: boolean;
};

export function isValidUserRole(role: string): role is UserRole {
  return ROLE_SET.has(role as UserRole);
}

export function normalizeRole(value: unknown): UserRole {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : 'USER';
  return ROLE_SET.has(role as UserRole) ? (role as UserRole) : 'USER';
}

export function canAccessAdminPanel(role: UserRole) {
  return canUseModeration(role);
}

export function canAccessAdminManagementPanel(role: UserRole) {
  return ADMIN_MANAGEMENT_ROLES.has(role);
}

export function canManageTarget(actorRole: UserRole, actorUserId: string, targetUserId: string, targetRole: UserRole) {
  if (actorRole === 'OWNER') {
    return targetRole !== 'OWNER';
  }

  if (actorRole === 'ADMIN') {
    return targetRole !== 'OWNER';
  }

  if (actorRole === 'MODERATOR') {
    if (targetRole === 'OWNER' || targetRole === 'ADMIN') {
      return false;
    }
    if (targetUserId === actorUserId) {
      return false;
    }
    return true;
  }

  if (actorRole === 'SUPPORT') {
    if (targetRole !== 'USER') {
      return false;
    }
    if (targetUserId === actorUserId) {
      return false;
    }
    return true;
  }

  return false;
}

export function canUseModeration(actorRole: UserRole) {
  return actorRole === 'OWNER' || actorRole === 'ADMIN' || actorRole === 'MODERATOR' || actorRole === 'SUPPORT';
}

/** Moderation inside the full admin management panel (excludes SUPPORT). */
export function canUseAdminPanelModeration(actorRole: UserRole) {
  return canAccessAdminManagementPanel(actorRole);
}

export function canUseUserManagement(actorRole: UserRole) {
  return actorRole === 'OWNER' || actorRole === 'ADMIN';
}

export function canManageRoles(actorRole: UserRole) {
  return canUseUserManagement(actorRole);
}

export function canUseSystemFinance(actorRole: UserRole) {
  return canUseUserManagement(actorRole);
}

export function buildAdminPermissions(role: UserRole): AdminPermissions {
  return {
    systemFinance: canUseSystemFinance(role),
    userManagement: canUseUserManagement(role),
    moderationLogs: role === 'OWNER' || role === 'ADMIN' || role === 'MODERATOR',
    canManageRoles: canManageRoles(role),
    helpDesk: canUseModeration(role),
  };
}

export async function assertAdminAccess() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const actorRole = normalizeRole(actor?.role);
  if (!canUseModeration(actorRole)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true as const, adminUserId: userId, actorRole };
}

/** Stricter gate for user-management admin panel routes (OWNER/ADMIN/MODERATOR only). */
export async function assertAdminManagementAccess() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, role: true },
  });

  const actorRole = normalizeRole(actor?.role);
  if (!canAccessAdminManagementPanel(actorRole)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    ok: true as const,
    adminUserId: userId,
    actorRole,
    actorUsername: String(actor?.username ?? '').trim(),
  };
}
