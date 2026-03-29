import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export type SystemMaintenanceState = {
  isMaintenanceMode: boolean;
  maintenanceEndTime: Date | null;
};

function toState(row: {
  isMaintenanceMode: boolean;
  maintenanceEndTime: Date | null;
}): SystemMaintenanceState {
  return {
    isMaintenanceMode: Boolean(row.isMaintenanceMode),
    maintenanceEndTime: row.maintenanceEndTime ?? null,
  };
}

export async function ensureSystemSettings(tx?: Prisma.TransactionClient): Promise<SystemMaintenanceState> {
  const client = tx ?? prisma;
  const settings = await client.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
    select: {
      isMaintenanceMode: true,
      maintenanceEndTime: true,
    },
  });

  return toState(settings);
}

export async function getResolvedSystemSettings(tx?: Prisma.TransactionClient): Promise<SystemMaintenanceState> {
  const client = tx ?? prisma;
  const current = await ensureSystemSettings(tx);

  if (!current.isMaintenanceMode || !current.maintenanceEndTime) {
    return current;
  }

  if (current.maintenanceEndTime.getTime() > Date.now()) {
    return current;
  }

  const updated = await client.systemSettings.update({
    where: { id: 1 },
    data: {
      isMaintenanceMode: false,
      maintenanceEndTime: null,
    },
    select: {
      isMaintenanceMode: true,
      maintenanceEndTime: true,
    },
  });

  return toState(updated);
}

export async function updateSystemSettings(
  next: {
    isMaintenanceMode: boolean;
    maintenanceEndTime: Date | null;
  },
  tx?: Prisma.TransactionClient,
): Promise<SystemMaintenanceState> {
  const client = tx ?? prisma;
  const updated = await client.systemSettings.upsert({
    where: { id: 1 },
    update: {
      isMaintenanceMode: next.isMaintenanceMode,
      maintenanceEndTime: next.maintenanceEndTime,
    },
    create: {
      id: 1,
      isMaintenanceMode: next.isMaintenanceMode,
      maintenanceEndTime: next.maintenanceEndTime,
    },
    select: {
      isMaintenanceMode: true,
      maintenanceEndTime: true,
    },
  });

  return toState(updated);
}
