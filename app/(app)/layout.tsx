import type { ReactNode } from 'react';

import { Shell } from '@/components/Shell';
import { SocketProvider } from '@/components/SocketProvider';
import { requireUser } from '@/lib/auth';
import { db, hub } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { atLeast } from '@/lib/roles';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const isStaff = atLeast(user.role, 'SUPPORT');

  if (hub.maintenance.on && !isStaff) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="glow text-4xl font-black text-accent">Wartung</h1>
          <p className="mt-3 text-muted">Neon Vault wird gerade verbessert.</p>
          {hub.maintenance.endsAt && <p className="mt-1 text-sm text-muted">Voraussichtlich bis {new Date(hub.maintenance.endsAt).toLocaleString('de-DE')}</p>}
        </div>
      </main>
    );
  }

  const notifications = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 });

  return (
    <SocketProvider me={{ id: user.id, username: user.username, soundEnabled: user.soundEnabled }} initialBalance={Number(user.balance)}>
      <Shell
        user={{ username: user.username, avatarUrl: user.avatarUrl, level: levelOf(user.xp), role: user.role }}
        notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
        maintenance={hub.maintenance.on}
      >
        {children}
      </Shell>
    </SocketProvider>
  );
}
