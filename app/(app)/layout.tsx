import type { ReactNode } from 'react';

import { Shell } from '@/components/Shell';
import { SocketProvider } from '@/components/SocketProvider';
import { Logo } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { db, hub } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { atLeast } from '@/lib/roles';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const isStaff = atLeast(user.role, 'SUPPORT');

  if (hub.maintenance.on && !isStaff) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm">
          <Logo />
          <h1 className="mt-8 text-2xl font-semibold">Kurz in Wartung</h1>
          <p className="mt-2 text-sm text-muted">Wir verbessern gerade etwas. Dein Guthaben ist sicher.</p>
          {hub.maintenance.endsAt && <p className="mt-4 text-sm text-faint">Voraussichtlich zurück: {new Date(hub.maintenance.endsAt).toLocaleString('de-DE')}</p>}
        </div>
      </main>
    );
  }

  const notifications = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 });

  return (
    <SocketProvider me={{ id: user.id, username: user.username, soundEnabled: user.soundEnabled }} initialBalance={Number(user.balance)}>
      <Shell
        user={{ username: user.username, avatarUrl: user.avatarUrl, frame: user.frame, level: levelOf(user.xp), role: user.role }}
        notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
        maintenance={hub.maintenance.on}
      >
        {children}
      </Shell>
    </SocketProvider>
  );
}
