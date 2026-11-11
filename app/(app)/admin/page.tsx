import { LayoutDashboard, PartyPopper, Radio, Server, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { atLeast } from '@/lib/roles';
import { FunTab, LiveTab, OverviewTab, PlayersTab, ServerTab, StatusPills } from './sections';

export const metadata = { title: 'Admin' };

const TABS: { key: string; label: string; icon: LucideIcon; min: 'SUPPORT' | 'MODERATOR' | 'ADMIN' }[] = [
  { key: 'overview', label: 'Übersicht', icon: LayoutDashboard, min: 'SUPPORT' },
  { key: 'players', label: 'Spieler', icon: Users, min: 'SUPPORT' },
  { key: 'live', label: 'Live', icon: Radio, min: 'MODERATOR' },
  { key: 'server', label: 'Server', icon: Server, min: 'ADMIN' },
  { key: 'fun', label: 'Spaß', icon: PartyPopper, min: 'ADMIN' },
];

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const actor = await requireRole('SUPPORT');
  const params = (await searchParams) as { tab?: string; q?: string; user?: string };
  const tabs = TABS.filter((t) => atLeast(actor.role, t.min));
  const tab = tabs.find((t) => t.key === params.tab)?.key ?? 'overview';

  return (
    <>
      <PageHeader title="Admin" subtitle={`Angemeldet als ${actor.username} · ${actor.role}`} action={<StatusPills />} />
      <nav className="no-scrollbar -mx-3 mb-5 flex gap-1 overflow-x-auto border-b border-line px-3 sm:mx-0 sm:px-0">
        {tabs.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin?tab=${key}`}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              tab === key ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            <Icon size={16} /> {label}
          </Link>
        ))}
      </nav>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'players' && <PlayersTab actor={actor} q={params.q ?? ''} selectedId={params.user} />}
      {tab === 'live' && <LiveTab actor={actor} />}
      {tab === 'server' && <ServerTab actor={actor} />}
      {tab === 'fun' && <FunTab q={params.q ?? ''} selectedId={params.user} />}
    </>
  );
}
