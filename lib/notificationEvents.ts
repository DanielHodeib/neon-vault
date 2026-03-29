import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';

type NotificationType = 'SUPPORT_REPLY' | 'MONEY_RECEIVED' | 'QUEST_COMPLETED' | 'SYSTEM' | 'VIP_UPGRADE';

export async function sendUserNotification(payload: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}) {
  const userId = String(payload.userId ?? '').trim();
  const title = String(payload.title ?? '').trim().slice(0, 120);
  const message = String(payload.message ?? '').trim().slice(0, 400);

  if (!userId || !title || !message) {
    return;
  }

  const gameServerUrl = getGameServerUrl();
  await fetch(`${gameServerUrl}/internal/notifications/send`, {
    method: 'POST',
    headers: getInternalHeaders(),
    cache: 'no-store',
    body: JSON.stringify({
      userId,
      type: payload.type,
      title,
      message,
    }),
  }).catch(() => null);
}
