import Link from 'next/link';

import { Duels } from '@/components/arena/Duels';
import { Markets, type MarketView } from '@/components/arena/Markets';
import { atLeast } from '@/lib/roles';
import type { MarketOption } from '@/lib/markets';
import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/hub';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  const t = await getT();
  return { title: t('Arena') };
}

/** Open markets plus the last decided ones, with pots and the viewer's own stakes. */
async function loadMarkets(me: { id: string; role: Parameters<typeof atLeast>[0] }) {
  const markets = await db.market.findMany({
    where: { OR: [{ status: 'open' }, { status: { not: 'open' }, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }] },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { creator: { select: { username: true } } },
  });
  const sums = await db.marketBet.groupBy({ by: ['marketId', 'option'], where: { marketId: { in: markets.map((m) => m.id) } }, _sum: { amount: true } });
  const mine = await db.marketBet.groupBy({ by: ['marketId', 'option'], where: { userId: me.id, marketId: { in: markets.map((m) => m.id) } }, _sum: { amount: true } });
  const bettors = await db.marketBet.groupBy({ by: ['marketId', 'userId'], where: { marketId: { in: markets.map((m) => m.id) } } });
  const sum = (rows: typeof sums, id: string, o: string) => Number(rows.find((r) => r.marketId === id && r.option === o)?._sum.amount ?? 0);
  const views: MarketView[] = markets.map((m) => ({
    id: m.id,
    question: m.question,
    optionA: m.optionA,
    optionB: m.optionB,
    creator: m.creator.username,
    mine: m.creatorId === me.id,
    canSettle: m.status === 'open' && (m.creatorId === me.id || atLeast(me.role, 'MODERATOR')),
    closesAt: m.closesAt.getTime(),
    status: m.status as MarketView['status'],
    outcome: m.outcome as MarketOption | null,
    poolA: sum(sums, m.id, 'A'),
    poolB: sum(sums, m.id, 'B'),
    bettors: bettors.filter((b) => b.marketId === m.id).length,
    myA: sum(mine, m.id, 'A'),
    myB: sum(mine, m.id, 'B'),
  }));
  return { open: views.filter((v) => v.status === 'open'), done: views.filter((v) => v.status !== 'open').slice(0, 8), now: Date.now() };
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
      {tab === 'duels' ? <Duels friends={friends} /> : <Markets {...await loadMarkets(me)} />}
    </div>
  );
}
