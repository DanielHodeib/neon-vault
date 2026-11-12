import Link from 'next/link';

import { Duels } from '@/components/arena/Duels';
import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/hub';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  const t = await getT();
  return { title: t('Arena') };
}

const TABS = [
  { key: 'duels', label: 'Duelle' },
  { key: 'bets', label: 'Wetten' },
] as const;

export default async function ArenaPage({ searchParams }: PageProps<'/arena'>) {
  const t = await getT();
  const me = await requireUser();
  const tab = (await searchParams).tab === 'bets' ? 'bets' : 'duels';
  const links = await db.friendship.findMany({
    where: { accepted: true, OR: [{ fromId: me.id }, { toId: me.id }] },
    select: { from: { select: { username: true } }, to: { select: { username: true } } },
  });
  const friends = links.map((l) => (l.from.username === me.username ? l.to.username : l.from.username)).sort();

  return (
    <div>
      <PageHeader title="Arena" subtitle={t('Fordere Freunde heraus oder wette auf alles Mögliche.')} />
      <nav className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1" aria-label="Arena">
        {TABS.map((tb) => (
          <Link key={tb.key} href={`/arena?tab=${tb.key}`} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === tb.key ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}>
            {t(tb.label)}
          </Link>
        ))}
      </nav>
      {tab === 'duels' ? <Duels friends={friends} /> : <p className="text-sm text-muted">…</p>}
    </div>
  );
}
