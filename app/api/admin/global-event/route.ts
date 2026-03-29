import { NextResponse } from 'next/server';

import { assertAdminAccess } from '@/lib/adminAccess';
import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';

function canManageEvents(actorRole: string) {
  const role = String(actorRole || '').toUpperCase();
  return role === 'OWNER' || role === 'ADMIN';
}

export async function GET() {
  const access = await assertAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  if (!canManageEvents(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const gameServerUrl = getGameServerUrl();
  const response = await fetch(`${gameServerUrl}/internal/global-event`, {
    method: 'GET',
    headers: getInternalHeaders(),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ error: 'Failed to load global event status.' }, { status: 502 });
  }

  const payload = (await response.json()) as { event?: unknown };
  return NextResponse.json({ ok: true, event: payload.event ?? null });
}

export async function POST(request: Request) {
  const access = await assertAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  if (!canManageEvents(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let payload: {
    action?: 'start' | 'stop';
    eventType?: string;
    durationMinutes?: number;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const action = String(payload.action ?? '').trim().toLowerCase();
  const gameServerUrl = getGameServerUrl();

  if (action === 'start') {
    const eventType = String(payload.eventType ?? '').trim().toUpperCase();
    const durationMinutes = Math.max(1, Math.min(180, Math.floor(Number(payload.durationMinutes ?? 10))));

    const response = await fetch(`${gameServerUrl}/internal/global-event/manual-start`, {
      method: 'POST',
      headers: getInternalHeaders(),
      cache: 'no-store',
      body: JSON.stringify({ eventType, durationMinutes }),
    }).catch(() => null);

    if (!response) {
      return NextResponse.json({ error: 'Failed to start global event.' }, { status: 502 });
    }

    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; event?: unknown };
    if (!response.ok || !result.ok) {
      return NextResponse.json({ error: result.error ?? 'Failed to start global event.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, event: result.event ?? null });
  }

  if (action === 'stop') {
    const response = await fetch(`${gameServerUrl}/internal/global-event/force-stop`, {
      method: 'POST',
      headers: getInternalHeaders(),
      cache: 'no-store',
      body: JSON.stringify({}),
    }).catch(() => null);

    if (!response) {
      return NextResponse.json({ error: 'Failed to stop global event.' }, { status: 502 });
    }

    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; stopped?: boolean };
    if (!response.ok || !result.ok) {
      return NextResponse.json({ error: result.error ?? 'Failed to stop global event.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, stopped: Boolean(result.stopped) });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
