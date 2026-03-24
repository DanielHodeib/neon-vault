import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type AccountPayload =
  | {
      action: 'username';
      username: string;
      currentPassword: string;
    }
  | {
      action: 'password';
      currentPassword: string;
      nextPassword: string;
    };

function validUsername(value: string) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: AccountPayload;
  try {
    payload = (await request.json()) as AccountPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const currentPassword = payload.currentPassword?.toString() ?? '';
  const validCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validCurrent) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  if (payload.action === 'username') {
    const nextUsername = payload.username?.trim() ?? '';

    if (!validUsername(nextUsername)) {
      return NextResponse.json(
        { error: 'Username must be 3-20 chars and only contain letters, numbers, or _.' },
        { status: 400 }
      );
    }

    if (nextUsername === user.username) {
      return NextResponse.json({ error: 'New username is the same as current username.' }, { status: 400 });
    }

    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { username: nextUsername },
      });
      return NextResponse.json({ ok: true, username: nextUsername, requiresRelogin: true });
    } catch {
      return NextResponse.json({ error: 'Username is already in use.' }, { status: 409 });
    }
  }

  const nextPassword = payload.nextPassword?.toString() ?? '';
  if (nextPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
  }

  if (nextPassword === currentPassword) {
    return NextResponse.json({ error: 'Choose a different new password.' }, { status: 400 });
  }

  const nextHash = await bcrypt.hash(nextPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: nextHash },
  });

  return NextResponse.json({ ok: true });
}
