import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

type InternalAction = 'friend_request' | 'accept_friend' | 'get_online_friends' | 'get_public_profile';

function isAuthorizedInternalRequest(request: Request) {
  const token = (process.env.INTERNAL_API_TOKEN ?? '').trim();
  if (!token) {
    return true;
  }

  const headerToken = (request.headers.get('x-internal-token') ?? '').trim();
  return headerToken.length > 0 && headerToken === token;
}

export async function POST(request: Request) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized internal request.' }, { status: 401 });
  }

  let payload: {
    action?: InternalAction;
    senderUsername?: string;
    receiverUsername?: string;
    accepterUsername?: string;
    username?: string;
    requesterUsername?: string;
    targetUserId?: string;
    targetUsername?: string;
    onlineUsers?: Array<{ username?: string; online?: boolean; activity?: string }>;
  };

  try {
    payload = (await request.json()) as {
      action?: InternalAction;
      senderUsername?: string;
      receiverUsername?: string;
      accepterUsername?: string;
      username?: string;
      requesterUsername?: string;
      targetUserId?: string;
      targetUsername?: string;
      onlineUsers?: Array<{ username?: string; online?: boolean; activity?: string }>;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const action = payload.action;
  if (!action) {
    return NextResponse.json({ error: 'Action is required.' }, { status: 400 });
  }

  if (action === 'friend_request') {
    const senderUsername = (payload.senderUsername ?? '').trim();
    const receiverUsername = (payload.receiverUsername ?? '').trim();

    if (!senderUsername || !receiverUsername) {
      return NextResponse.json({ error: 'senderUsername and receiverUsername are required.' }, { status: 400 });
    }

    if (senderUsername.toLowerCase() === receiverUsername.toLowerCase()) {
      return NextResponse.json({ error: 'You cannot add yourself.' }, { status: 400 });
    }

    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({ where: { username: senderUsername }, select: { id: true, username: true } }),
      prisma.user.findUnique({ where: { username: receiverUsername }, select: { id: true, username: true } }),
    ]);

    if (!sender || !receiver) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: sender.id, friendId: receiver.id },
          { userId: receiver.id, friendId: sender.id },
        ],
      },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return NextResponse.json({ error: 'Already friends.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Friend request already pending.' }, { status: 409 });
    }

    const created = await prisma.friendship.create({
      data: {
        userId: sender.id,
        friendId: receiver.id,
        status: 'pending',
      },
      select: {
        id: true,
        createdAt: true,
        user: { select: { id: true, username: true } },
        friend: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      request: {
        friendshipId: created.id,
        senderId: created.user.id,
        senderUsername: created.user.username,
        receiverId: created.friend.id,
        receiverUsername: created.friend.username,
        requestedAt: created.createdAt,
      },
    });
  }

  if (action === 'accept_friend') {
    const senderUsername = (payload.senderUsername ?? '').trim();
    const accepterUsername = (payload.accepterUsername ?? '').trim();

    if (!senderUsername || !accepterUsername) {
      return NextResponse.json({ error: 'senderUsername and accepterUsername are required.' }, { status: 400 });
    }

    const [sender, accepter] = await Promise.all([
      prisma.user.findUnique({ where: { username: senderUsername }, select: { id: true, username: true } }),
      prisma.user.findUnique({ where: { username: accepterUsername }, select: { id: true, username: true } }),
    ]);

    if (!sender || !accepter) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const pending = await prisma.friendship.findFirst({
      where: {
        userId: sender.id,
        friendId: accepter.id,
        status: 'pending',
      },
      select: { id: true },
    });

    if (!pending) {
      return NextResponse.json({ error: 'Pending request not found.' }, { status: 404 });
    }

    const friendship = await prisma.friendship.update({
      where: { id: pending.id },
      data: { status: 'accepted' },
      select: { id: true, status: true },
    });

    return NextResponse.json({ ok: true, friendship });
  }

  if (action === 'get_online_friends') {
    const username = (payload.username ?? '').trim();
    if (!username) {
      return NextResponse.json({ error: 'username is required.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const accepted = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ userId: user.id }, { friendId: user.id }],
      },
      include: {
        user: { select: { id: true, username: true } },
        friend: { select: { id: true, username: true } },
      },
    });

    const onlineMap = new Map<string, { online: boolean; activity: string }>();
    for (const entry of payload.onlineUsers ?? []) {
      const onlineName = String(entry?.username ?? '').trim();
      if (!onlineName) {
        continue;
      }

      onlineMap.set(onlineName.toLowerCase(), {
        online: Boolean(entry?.online),
        activity: String(entry?.activity ?? 'Hub').trim() || 'Hub',
      });
    }

    const friends = accepted.map((row) => {
      const counterpart = row.userId === user.id ? row.friend : row.user;
      const presence = onlineMap.get(counterpart.username.toLowerCase()) ?? { online: false, activity: 'Offline' };
      return {
        friendshipId: row.id,
        userId: counterpart.id,
        username: counterpart.username,
        online: presence.online,
        activity: presence.activity,
      };
    });

    return NextResponse.json({ ok: true, friends });
  }

  if (action === 'get_public_profile') {
    const requesterUsername = (payload.requesterUsername ?? '').trim();
    const targetUserId = (payload.targetUserId ?? '').trim();
    const targetUsername = (payload.targetUsername ?? '').trim();

    if (!targetUserId && !targetUsername) {
      return NextResponse.json({ error: 'targetUserId or targetUsername is required.' }, { status: 400 });
    }

    const requester = requesterUsername
      ? await prisma.user.findUnique({ where: { username: requesterUsername }, select: { id: true } })
      : null;

    const target = targetUserId
      ? await prisma.user.findUnique({
          where: { id: targetUserId },
          select: {
            id: true,
            username: true,
            role: true,
            avatarUrl: true,
            bannerUrl: true,
            bio: true,
            balance: true,
            xp: true,
            createdAt: true,
            settings: {
              select: {
                publicProfile: true,
                bio: true,
                selectedRankTag: true,
                favoriteGame: true,
                privacyShowBalance: true,
                publicGameHistory: true,
              },
            },
          },
        })
      : await prisma.user.findUnique({
          where: { username: targetUsername },
          select: {
            id: true,
            username: true,
            role: true,
            avatarUrl: true,
            bannerUrl: true,
            bio: true,
            balance: true,
            xp: true,
            createdAt: true,
            settings: {
              select: {
                publicProfile: true,
                bio: true,
                selectedRankTag: true,
                favoriteGame: true,
                privacyShowBalance: true,
                publicGameHistory: true,
              },
            },
          },
        });

    if (!target) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const requesterUserId = requester?.id ?? null;
    const isSelf = Boolean(requesterUserId) && requesterUserId === target.id;

    let isFriend = false;
    if (requesterUserId && !isSelf) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { userId: requesterUserId, friendId: target.id },
            { userId: target.id, friendId: requesterUserId },
          ],
        },
        select: { id: true },
      });
      isFriend = Boolean(friendship);
    }

    const publicProfile = target.settings?.publicProfile ?? true;
    if (!isSelf && !isFriend && !publicProfile) {
      return NextResponse.json({ error: 'Profile is private.' }, { status: 403 });
    }

    const friendsCount = await prisma.friendship.count({
      where: {
        status: 'accepted',
        OR: [{ userId: target.id }, { friendId: target.id }],
      },
    });

    const canShowBalance = isSelf || Boolean(target.settings?.privacyShowBalance);

    return NextResponse.json({
      ok: true,
      profile: {
        userId: target.id,
        username: target.username,
        role: target.role,
        level: Math.floor(Number(target.xp || 0) / 1000) + 1,
        rank: target.settings?.selectedRankTag ?? 'BRONZE',
        avatarUrl: target.avatarUrl,
        bannerUrl: target.bannerUrl,
        bio: (target.bio ?? target.settings?.bio ?? '').trim(),
        favoriteGame: (target.settings?.favoriteGame ?? '').trim() || 'Unknown',
        joinDate: target.createdAt,
        balance: canShowBalance ? Number(target.balance || 0) : null,
        canShowBalance,
        isFriend,
        publicProfile,
        publicGameHistory: Boolean(target.settings?.publicGameHistory),
        friendsCount,
      },
    });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
