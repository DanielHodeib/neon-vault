export function getGameServerUrl() {
  const fromEnv =
    process.env.GAME_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  if (!fromEnv || fromEnv === 'same-origin') {
    return 'http://localhost:4001';
  }

  try {
    return new URL(fromEnv).toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:4001';
  }
}

export function getInternalHeaders() {
  const token = (process.env.INTERNAL_API_TOKEN ?? '').trim();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'x-internal-token': token } : {}),
  };
}
