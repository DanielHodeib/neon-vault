import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import {
  assertAdminManagementAccess,
  canManageRoles,
  canManageTarget,
  canUseAdminPanelModeration,
  canUseSystemFinance,
  canUseUserManagement,
  isValidUserRole,
  normalizeRole,
  type UserRole,
} from '@/lib/adminAccess';
import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';
import { prisma } from '@/lib/prisma';
import { isRankTag, type RankTag } from '@/lib/ranks';

type AdminQuickAction =
  | 'add-balance-1000'
  | 'add-balance-10000'
  | 'add-xp-1000'
  | 'add-xp-10000'
  | 'reset-daily'
  | 'reset-quests'
  | 'reset-social'
  | 'delete-user';

type AdminAction = 'set-role' | 'edit-balance' | 'toggle-ban' | 'update-user' | 'set-password' | 'quick-action';

const FOUNDER_USERNAME = 'Daniel';

function balanceToNumber(balance: { toNumber(): number } | string | number | null | undefined) {
  if (balance && typeof balance === 'object' && 'toNumber' in balance) {
    return balance.toNumber();
  }

  const value = Number(balance ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function balanceToString(balance: { toString(): string } | string | number | null | undefined) {
  if (balance && typeof balance === 'object' && 'toString' in balance) {
    return balance.toString();
  }

  return String(balance ?? '0');
}

async function notifyUserWalletRefresh(username: string) {
  const safeUsername = username.trim();
  if (!safeUsername) {
    return;
  }

  const gameServerUrl = getGameServerUrl();
  await fetch(`${gameServerUrl}/internal/user/refresh`, {
    method: 'POST',
    headers: getInternalHeaders(),
    body: JSON.stringify({ username: safeUsername }),
    cache: 'no-store',
  }).catch(() => null);
}

function enforceFounderRoleSecurity(input: {
  actorUsername: string;
  targetUsername: string;
  targetRole: UserRole;
  nextRole: UserRole;
}) {
  const actorIsFounder = input.actorUsername === FOUNDER_USERNAME;
  const targetIsFounder = input.targetUsername === FOUNDER_USERNAME;

  if (targetIsFounder && !actorIsFounder) {
    return NextResponse.json(
      { error: 'System Override: Die Rechte des Gründers können nicht geändert werden.' },
      { status: 403 }
    );
  }

  if (input.nextRole === 'OWNER' && !actorIsFounder) {
    return NextResponse.json({ error: 'Only Daniel can assign OWNER role.' }, { status: 403 });
  }

  if (input.targetRole === 'OWNER' && input.nextRole !== 'OWNER' && !actorIsFounder) {
    return NextResponse.json({ error: 'Only Daniel can demote an OWNER.' }, { status: 403 });
  }

  return null;
}

export async function GET(request: Request) {
  const access = await assertAdminManagementAccess();
  if (!access.ok) {
    return access.response;
  }

  if (!canUseAdminPanelModeration(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const bannedOnly = (searchParams.get('bannedOnly') ?? '').trim().toLowerCase() === 'true';

  const users = await prisma.user.findMany({
    where: {
      ...(bannedOnly ? { isBanned: true } : {}),
      ...(q ? { username: { contains: q } } : {}),
    },
    orderBy: { username: 'asc' },
    select: {
      id: true,
      username: true,
      role: true,
      balance: true,
      xp: true,
      clanTag: true,
      isBanned: true,
      banExpiresAt: true,
      banReason: true,
      settings: {
        select: {
          selectedRankTag: true,
        },
      },
    },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      balance: balanceToString(user.balance),
      xp: user.xp,
      clanTag: user.clanTag || null,
      isBanned: Boolean(user.isBanned),
      banExpiresAt: user.banExpiresAt ? user.banExpiresAt.toISOString() : null,
      banReason: user.banReason,
      selectedRankTag: user.settings?.selectedRankTag ?? 'BRONZE',
    })),
  });
}

export async function PATCH(request: Request) {
  const access = await assertAdminManagementAccess();
  if (!access.ok) {
    return access.response;
  }

  let payload: {
    action?: AdminAction;
    userId?: string;
    role?: UserRole;
    balance?: number;
    isBanned?: boolean;
    username?: string;
    xp?: number;
    level?: number;
    clanTag?: string | null;
    selectedRankTag?: RankTag;
    password?: string;
    newPassword?: string;
    quickAction?: AdminQuickAction;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const action = payload.action;
  const targetUserId = (payload.userId ?? '').trim();

  if (!action || !targetUserId) {
    return NextResponse.json({ error: 'action and userId are required.' }, { status: 400 });
  }

  if (targetUserId === access.adminUserId && action === 'toggle-ban') {
    return NextResponse.json({ error: 'You cannot ban yourself.' }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, username: true, role: true } });
  if (!exists) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const targetRole = normalizeRole(exists.role);

  if (action === 'toggle-ban') {
    if (!canUseAdminPanelModeration(access.actorRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (!canUseUserManagement(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const founderRoleOperation =
    access.actorUsername === FOUNDER_USERNAME
    && (action === 'set-role' || (action === 'update-user' && typeof payload.role === 'string'));

  if (!founderRoleOperation && !canManageTarget(access.actorRole, access.adminUserId, targetUserId, targetRole)) {
    return NextResponse.json({ error: 'Insufficient permission for this user.' }, { status: 403 });
  }

  if (action === 'set-role') {
    if (access.actorUsername !== FOUNDER_USERNAME) {
      return NextResponse.json({ error: 'Only the founder can assign roles.' }, { status: 403 });
    }

    if (targetUserId === access.adminUserId) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
    }

    const role = payload.role;
    if (!role || !isValidUserRole(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }

    const founderGuard = enforceFounderRoleSecurity({
      actorUsername: access.actorUsername,
      targetUsername: exists.username,
      targetRole,
      nextRole: role,
    });
    if (founderGuard) {
      return founderGuard;
    }

    await prisma.user.update({ where: { id: targetUserId }, data: { role } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'edit-balance') {
    const numericBalance = Number(payload.balance);
    if (!Number.isFinite(numericBalance) || numericBalance < 0) {
      return NextResponse.json({ error: 'Invalid balance.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: { balance: numericBalance.toFixed(2) },
    });
    void notifyUserWalletRefresh(exists.username);
    return NextResponse.json({ ok: true });
  }

  if (action === 'toggle-ban') {
    if (typeof payload.isBanned !== 'boolean') {
      return NextResponse.json({ error: 'isBanned must be boolean.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: { isBanned: payload.isBanned },
    });

    if (payload.isBanned) {
      const gameServerUrl = getGameServerUrl();
      await fetch(`${gameServerUrl}/internal/user/force-disconnect`, {
        method: 'POST',
        headers: getInternalHeaders(),
        body: JSON.stringify({ username: exists.username, reason: 'Account permanently banned.' }),
        cache: 'no-store',
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true });
  }

  if (action === 'update-user') {
    const updates: {
      username?: string;
      xp?: number;
      clanTag?: string | null;
      role?: UserRole;
      balance?: string;
      isBanned?: boolean;
    } = {};

    if (typeof payload.username === 'string') {
      const nextUsername = payload.username.trim();
      if (!nextUsername) {
        return NextResponse.json({ error: 'Username cannot be empty.' }, { status: 400 });
      }

      const existingByName = await prisma.user.findUnique({
        where: { username: nextUsername },
        select: { id: true },
      });

      if (existingByName && existingByName.id !== targetUserId) {
        return NextResponse.json({ error: 'Username already taken.' }, { status: 400 });
      }

      updates.username = nextUsername;
    }

    if (typeof payload.role === 'string') {
      if (!isValidUserRole(payload.role)) {
        return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
      }

      if (access.actorUsername !== FOUNDER_USERNAME) {
        return NextResponse.json({ error: 'Only the founder can assign roles.' }, { status: 403 });
      }

      if (targetUserId === access.adminUserId) {
        return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
      }

      const founderGuard = enforceFounderRoleSecurity({
        actorUsername: access.actorUsername,
        targetUsername: exists.username,
        targetRole,
        nextRole: payload.role,
      });
      if (founderGuard) {
        return founderGuard;
      }

      updates.role = payload.role;
    }

    if (typeof payload.balance === 'number') {
      if (!Number.isFinite(payload.balance) || payload.balance < 0) {
        return NextResponse.json({ error: 'Invalid balance.' }, { status: 400 });
      }
      updates.balance = payload.balance.toFixed(2);
    }

    if (typeof payload.level === 'number') {
      if (!Number.isFinite(payload.level) || payload.level < 1) {
        return NextResponse.json({ error: 'Invalid level.' }, { status: 400 });
      }
      updates.xp = Math.max(0, Math.floor((Math.floor(payload.level) - 1) * 1000));
    } else if (typeof payload.xp === 'number') {
      if (!Number.isFinite(payload.xp) || payload.xp < 0) {
        return NextResponse.json({ error: 'Invalid xp.' }, { status: 400 });
      }
      updates.xp = Math.max(0, Math.floor(payload.xp));
    }

    if (payload.clanTag === null) {
      updates.clanTag = null;
    } else if (typeof payload.clanTag === 'string') {
      const normalizedClanTag = payload.clanTag.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase().slice(0, 5);
      updates.clanTag = normalizedClanTag || null;
    }

    if (typeof payload.isBanned === 'boolean') {
      updates.isBanned = payload.isBanned;
    }

    const hasUserUpdates =
      updates.username !== undefined ||
      updates.role !== undefined ||
      updates.balance !== undefined ||
      updates.xp !== undefined ||
      updates.clanTag !== undefined ||
      updates.isBanned !== undefined;

    const hasRankUpdate = typeof payload.selectedRankTag === 'string';

    if (!hasUserUpdates && !hasRankUpdate) {
      return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
    }

    if (hasRankUpdate && !isRankTag(payload.selectedRankTag as string)) {
      return NextResponse.json({ error: 'Invalid selected rank tag.' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (hasUserUpdates) {
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            ...(updates.username !== undefined ? { username: updates.username } : {}),
            ...(updates.role !== undefined ? { role: updates.role } : {}),
            ...(updates.balance !== undefined ? { balance: updates.balance } : {}),
            ...(updates.xp !== undefined ? { xp: updates.xp } : {}),
            ...(updates.clanTag !== undefined ? { clanTag: updates.clanTag } : {}),
          },
        });

        if (updates.isBanned !== undefined) {
          await tx.$executeRawUnsafe(`UPDATE users SET is_banned = ? WHERE id = ?`, updates.isBanned ? 1 : 0, targetUserId);
        }
      }

      if (hasRankUpdate) {
        await tx.settings.upsert({
          where: { userId: targetUserId },
          update: { selectedRankTag: payload.selectedRankTag as RankTag },
          create: {
            userId: targetUserId,
            soundEnabled: true,
            theme: 'slate',
            selectedRankTag: payload.selectedRankTag as RankTag,
            publicProfile: true,
            bio: '',
          },
        });
      }
    });

    if (updates.balance !== undefined || updates.xp !== undefined || payload.level !== undefined) {
      const nextUsername = typeof updates.username === 'string' ? updates.username : exists.username;
      void notifyUserWalletRefresh(nextUsername);
    }

    return NextResponse.json({ ok: true });
  }

  if (action === 'set-password') {
    const rawPassword =
      typeof payload.newPassword === 'string'
        ? payload.newPassword
        : typeof payload.password === 'string'
          ? payload.password
          : '';
    const nextPassword = rawPassword.trim();

    if (nextPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    await prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash },
    });

    console.log(`[admin] password updated for userId=${targetUserId}`);
    return NextResponse.json({ ok: true });
  }

  if (action === 'quick-action') {
    const quickAction = payload.quickAction;
    if (!quickAction) {
      return NextResponse.json({ error: 'quickAction is required.' }, { status: 400 });
    }

    if (quickAction === 'delete-user' && targetUserId === access.adminUserId) {
      return NextResponse.json({ error: 'You cannot delete yourself.' }, { status: 400 });
    }

    if (quickAction === 'add-balance-1000' || quickAction === 'add-balance-10000') {
      const delta = quickAction === 'add-balance-1000' ? 1000 : 10000;
      const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { balance: true } });
      if (!user) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }
      const nextBalance = balanceToNumber(user.balance) + delta;
      await prisma.user.update({ where: { id: targetUserId }, data: { balance: nextBalance.toFixed(2) } });
      void notifyUserWalletRefresh(exists.username);
      return NextResponse.json({ ok: true });
    }

    if (quickAction === 'add-xp-1000' || quickAction === 'add-xp-10000') {
      const delta = quickAction === 'add-xp-1000' ? 1000 : 10000;
      await prisma.user.update({ where: { id: targetUserId }, data: { xp: { increment: delta } } });
      void notifyUserWalletRefresh(exists.username);
      return NextResponse.json({ ok: true });
    }

    if (quickAction === 'reset-daily') {
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          dailyBets: 0,
          dailyWins: 0,
          dailyFaucetClaimed: false,
          dailyQuestClaimed: false,
          dailyStatsDate: '',
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (quickAction === 'reset-quests') {
      await prisma.userQuest.deleteMany({
        where: { userId: targetUserId },
      });
      return NextResponse.json({ ok: true });
    }

    if (quickAction === 'reset-social') {
      await prisma.$transaction([
        prisma.friendship.deleteMany({
          where: {
            OR: [{ userId: targetUserId }, { friendId: targetUserId }],
          },
        }),
        prisma.block.deleteMany({
          where: {
            OR: [{ userId: targetUserId }, { blockedUserId: targetUserId }],
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    if (quickAction === 'delete-user') {
      await prisma.user.delete({ where: { id: targetUserId } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid quick action.' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function POST(request: Request) {
  const access = await assertAdminManagementAccess();
  if (!access.ok) {
    return access.response;
  }

  if (!canUseSystemFinance(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let payload: {
    message?: string;
    rain?: {
      amount?: number;
      duration?: number;
      participantsCount?: number;
    };
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const rainAmount = Math.floor(Number(payload.rain?.amount ?? 0));
  const rainDuration = Math.floor(Number(payload.rain?.duration ?? 0));
  const rainParticipants = Math.floor(Number(payload.rain?.participantsCount ?? 0));
  const hasRainPayload = rainAmount > 0 || rainDuration > 0 || rainParticipants > 0;

  if (hasRainPayload) {
    if (!Number.isFinite(rainAmount) || rainAmount <= 0) {
      return NextResponse.json({ error: 'Rain amount must be greater than 0.' }, { status: 400 });
    }

    if (!Number.isFinite(rainDuration) || rainDuration < 5 || rainDuration > 600) {
      return NextResponse.json({ error: 'Rain duration must be between 5 and 600 seconds.' }, { status: 400 });
    }

    if (!Number.isFinite(rainParticipants) || rainParticipants < 1 || rainParticipants > 200) {
      return NextResponse.json({ error: 'Rain participants must be between 1 and 200.' }, { status: 400 });
    }

    const gameServerUrl = getGameServerUrl();
    const response = await fetch(`${gameServerUrl}/internal/rain/start`, {
      method: 'POST',
      headers: getInternalHeaders(),
      body: JSON.stringify({
        amount: rainAmount,
        duration: rainDuration,
        participantsCount: rainParticipants,
      }),
      cache: 'no-store',
    }).catch(() => null);

    if (!response || !response.ok) {
      return NextResponse.json({ error: 'Failed to start rain.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  }

  const message = (payload.message ?? '').trim().slice(0, 240);
  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  const gameServerUrl = getGameServerUrl();
  const response = await fetch(`${gameServerUrl}/internal/admin-broadcast`, {
    method: 'POST',
    headers: getInternalHeaders(),
    body: JSON.stringify({ message }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) {
    return NextResponse.json({ error: 'Failed to broadcast announcement.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
