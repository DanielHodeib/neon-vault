import { NextResponse } from 'next/server';

import { getResolvedSystemSettings } from '@/lib/systemSettings';

export async function GET() {
  const state = await getResolvedSystemSettings();

  return NextResponse.json({
    ok: true,
    maintenance: {
      isMaintenanceMode: state.isMaintenanceMode,
      maintenanceEndTime: state.maintenanceEndTime?.toISOString() ?? null,
    },
  });
}
