import { NextResponse } from 'next/server';

function getGameServerUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (!fromEnv) {
    return 'http://localhost:4001';
  }

  try {
    return new URL(fromEnv).toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:4001';
  }
}

export async function GET() {
  const gameServerUrl = getGameServerUrl();

  try {
    const response = await fetch(`${gameServerUrl}/presence`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ onlineCount: 0, users: [] });
    }

    const payload = (await response.json()) as {
      onlineCount?: number;
      users?: Array<{ username: string; activity: string; online: boolean }>;
    };

    return NextResponse.json({
      onlineCount: payload.onlineCount ?? 0,
      users: payload.users ?? [],
    });
  } catch {
    return NextResponse.json({ onlineCount: 0, users: [] });
  }
}
