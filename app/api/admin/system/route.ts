import { NextResponse } from 'next/server';

import { assertAdminAccess } from '@/lib/adminAccess';
import { getGameServerUrl, getInternalHeaders } from '@/lib/gameServerInternal';
import { getResolvedSystemSettings, updateSystemSettings } from '@/lib/systemSettings';

function canWriteMaintenance(actorRole: string) {
  const role = String(actorRole || '').toUpperCase();
  return role === 'OWNER' || role === 'ADMIN';
}

export async function GET() {
  const access = await assertAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const state = await getResolvedSystemSettings();
  return NextResponse.json({
    ok: true,
    settings: {
      isMaintenanceMode: state.isMaintenanceMode,
      maintenanceEndTime: state.maintenanceEndTime?.toISOString() ?? null,
    },
  });
}

export async function POST(request: Request) {
  const access = await assertAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  if (!canWriteMaintenance(access.actorRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let payload: { isMaintenanceMode?: boolean; maintenanceEndTime?: string | null };
  try {
    payload = (await request.json()) as { isMaintenanceMode?: boolean; maintenanceEndTime?: string | null };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (typeof payload.isMaintenanceMode !== 'boolean') {
    return NextResponse.json({ error: 'isMaintenanceMode is required.' }, { status: 400 });
  }

  let maintenanceEndTime: Date | null = null;
  if (payload.isMaintenanceMode && payload.maintenanceEndTime) {
    const parsed = new Date(payload.maintenanceEndTime);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'maintenanceEndTime is invalid.' }, { status: 400 });
    }

    maintenanceEndTime = parsed;
  }

  const state = await updateSystemSettings({
    isMaintenanceMode: payload.isMaintenanceMode,
    maintenanceEndTime: payload.isMaintenanceMode ? maintenanceEndTime : null,
  });

  const gameServerUrl = getGameServerUrl();
  await fetch(`${gameServerUrl}/internal/system/maintenance`, {
    method: 'POST',
    headers: getInternalHeaders(),
    cache: 'no-store',
    body: JSON.stringify({
      isMaintenanceMode: state.isMaintenanceMode,
      maintenanceEndTime: state.maintenanceEndTime?.toISOString() ?? null,
    }),
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    settings: {
      isMaintenanceMode: state.isMaintenanceMode,
      maintenanceEndTime: state.maintenanceEndTime?.toISOString() ?? null,
    },
  });
}
