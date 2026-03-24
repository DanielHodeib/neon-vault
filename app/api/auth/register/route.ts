import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

const MIN_USERNAME_LEN = 3;
const MIN_PASSWORD_LEN = 8;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (username.length < MIN_USERNAME_LEN) {
      return NextResponse.json(
        { error: `Username must be at least ${MIN_USERNAME_LEN} characters.` },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        settings: {
          create: {
            soundEnabled: true,
            theme: 'slate',
          },
        },
      },
      select: {
        id: true,
        username: true,
        balance: true,
        xp: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }
}
