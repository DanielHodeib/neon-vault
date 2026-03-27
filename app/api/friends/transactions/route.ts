import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = Number.isFinite(Number(limitParam)) ? Math.min(100, Math.max(1, Number(limitParam))) : 20;

  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        amount: true,
        message: true,
        createdAt: true,
        sender: { select: { username: true, role: true } },
        receiver: { select: { username: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const formatted = transactions.map((tx) => ({
      id: tx.id,
      direction: tx.senderId === userId ? ('out' as const) : ('in' as const),
      amount: tx.amount,
      senderUsername: tx.sender.username,
      senderRole: tx.sender.role,
      receiverUsername: tx.receiver.username,
      receiverRole: tx.receiver.role,
      message: tx.message || '',
      timestamp: tx.createdAt.toISOString(),
      createdAt: tx.createdAt,
    }));

    return NextResponse.json({ ok: true, transactions: formatted });
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
