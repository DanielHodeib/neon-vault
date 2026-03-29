import { NextResponse } from 'next/server';

import { getResolvedSystemSettings, updateSystemSettings } from '@/lib/systemSettings';

function isAuthorizedInternalRequest(request: Request) {
  const token = (process.env.INTERNAL_API_TOKEN ?? '').trim();
  if (!token) {
    return true;
  }

  const provided = (request.headers.get('x-internal-token') ?? '').trim();
  return provided.length > 0 && provided === token;
}

export async function GET(request: Request) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized internal request.' }, { status: 401 });
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
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized internal request.' }, { status: 401 });
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

  return NextResponse.json({
    ok: true,
    settings: {
      isMaintenanceMode: state.isMaintenanceMode,
      maintenanceEndTime: state.maintenanceEndTime?.toISOString() ?? null,
    },
  });
}
