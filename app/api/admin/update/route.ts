import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { auth } from '@/auth';
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

function getGameServerUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (!fromEnv || fromEnv === 'same-origin') {
    return 'http://localhost:4001';
  }

  try {
    return new URL(fromEnv).toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:4001';
  }
}

async function assertDanielAdmin() {
  const session = await auth();
  const userId = session?.user?.id;
  const username = session?.user?.name ?? '';

  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (username !== 'Daniel') {
    return { ok: false as const, response: new Response('Unauthorized', { status: 403 }) };
  }

  const admin = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, role: true },
  });

  if (!admin || admin.username !== 'Daniel' || admin.role !== 'ADMIN') {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true as const, adminUserId: userId };
}

export async function GET(request: Request) {
  const access = await assertDanielAdmin();
  if (!access.ok) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();

  const users = (await prisma.$queryRawUnsafe(
    `SELECT u.id, u.username, u.role, u.balance, u.xp,
            COALESCE(u.clan_tag, '') AS clan_tag,
            COALESCE(u.is_banned, 0) AS is_banned,
            COALESCE(s.selected_rank_tag, 'BRONZE') AS selected_rank_tag
     FROM users u
     LEFT JOIN settings s ON s.user_id = u.id
     ORDER BY u.username ASC`
  )) as Array<{
    id: string;
    username: string;
    role: string;
    balance: string;
    xp: number;
    clan_tag: string;
    is_banned: number | boolean;
    selected_rank_tag: string;
  }>;

  const filtered = q
    ? users.filter((user) => user.username.toLowerCase().includes(q))
    : users;

  return NextResponse.json({
    users: filtered.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      balance: user.balance,
      xp: user.xp,
      clanTag: user.clan_tag || null,
      isBanned: user.is_banned === true || user.is_banned === 1,
      selectedRankTag: user.selected_rank_tag,
    })),
  });
}

export async function PATCH(request: Request) {
  const access = await assertDanielAdmin();
  if (!access.ok) {
    return access.response;
  }

  let payload: {
    action?: AdminAction;
    userId?: string;
    role?: 'USER' | 'BALLER' | 'VIP' | 'ADMIN';
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

  const exists = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (action === 'set-role') {
    const role = payload.role;
    if (!role || !['USER', 'BALLER', 'VIP', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
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
    return NextResponse.json({ ok: true });
  }

  if (action === 'toggle-ban') {
    if (typeof payload.isBanned !== 'boolean') {
      return NextResponse.json({ error: 'isBanned must be boolean.' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`UPDATE users SET is_banned = ? WHERE id = ?`, payload.isBanned ? 1 : 0, targetUserId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'update-user') {
    const updates: {
      username?: string;
      xp?: number;
      clanTag?: string | null;
      role?: 'USER' | 'BALLER' | 'VIP' | 'ADMIN';
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
      if (!['USER', 'BALLER', 'VIP', 'ADMIN'].includes(payload.role)) {
        return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
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
      const balance = Number.parseFloat(user.balance ?? '0');
      const nextBalance = (Number.isFinite(balance) ? balance : 0) + delta;
      await prisma.user.update({ where: { id: targetUserId }, data: { balance: nextBalance.toFixed(2) } });
      return NextResponse.json({ ok: true });
    }

    if (quickAction === 'add-xp-1000' || quickAction === 'add-xp-10000') {
      const delta = quickAction === 'add-xp-1000' ? 1000 : 10000;
      await prisma.user.update({ where: { id: targetUserId }, data: { xp: { increment: delta } } });
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
      await prisma.$executeRawUnsafe(
        `DELETE FROM quest_progress WHERE user_id = ?`,
        targetUserId
      );
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
  const access = await assertDanielAdmin();
  if (!access.ok) {
    return access.response;
  }

  let payload: { message?: string };
  try {
    payload = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const message = (payload.message ?? '').trim().slice(0, 240);
  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  const gameServerUrl = getGameServerUrl();
  const response = await fetch(`${gameServerUrl}/internal/admin-broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) {
    return NextResponse.json({ error: 'Failed to broadcast announcement.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
