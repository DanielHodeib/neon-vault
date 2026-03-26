export async function notifyLeaderboardRefresh(payload: {
  username?: string;
  amount: number;
  reason: string;
}) {
  const base = process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  let target = 'http://127.0.0.1:4001';
  if (base && base !== 'same-origin') {
    try {
      target = new URL(base).toString().replace(/\/$/, '');
    } catch {
      target = 'http://127.0.0.1:4001';
    }
  }

  try {
    await fetch(`${target}/internal/leaderboard/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    // Ignore broadcast failures; leaderboard can still refresh on next poll.
  }
}

export async function notifyGlobalWinMessage(payload: {
  username: string;
  amount: number;
  source?: string;
  tier?: string;
  multiplier?: number;
}) {
  const base = process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  let target = 'http://127.0.0.1:4001';
  if (base && base !== 'same-origin') {
    try {
      target = new URL(base).toString().replace(/\/$/, '');
    } catch {
      target = 'http://127.0.0.1:4001';
    }
  }

  try {
    await fetch(`${target}/internal/chat/win`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    // Ignore notification failures; game flow should not break.
  }
}
