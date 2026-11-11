import { Empty, PageHeader, Section, UserLink } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { db } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { netProfitSince, startOfDay, startOfWeek } from '@/lib/wallet';

export const metadata = { title: 'Bestenliste' };

function Board({ title, rows, tone }: { title: string; rows: { name: string; value: string; positive?: boolean }[]; tone?: boolean }) {
  return (
    <Section title={title}>
      {rows.length === 0 && <Empty>Noch keine Daten.</Empty>}
      <ol className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="flex items-center gap-3">
              <span className={`num w-5 text-center text-xs ${i < 3 ? 'font-semibold text-gold' : 'text-faint'}`}>{i + 1}</span>
              <UserLink name={r.name} />
            </span>
            <span className={`num ${tone ? (r.positive ? 'text-win' : 'text-loss') : 'text-muted'}`}>{r.value}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const profit = (rows: { username: string; profit: number }[]) =>
  rows.map((t) => ({ name: t.username, value: `${t.profit >= 0 ? '+' : ''}${coins(t.profit)}`, positive: t.profit >= 0 }));

export default async function LeaderboardPage() {
  await requireUser();
  const [rich, xp, today, week] = await Promise.all([
    db.user.findMany({ orderBy: { balance: 'desc' }, take: 10, select: { username: true, balance: true } }),
    db.user.findMany({ orderBy: { xp: 'desc' }, take: 10, select: { username: true, xp: true } }),
    netProfitSince(startOfDay()),
    netProfitSince(startOfWeek()),
  ]);
  return (
    <>
      <PageHeader title="Bestenliste" subtitle="Gewinn zählt Einsätze und Auszahlungen aus allen Spielen." />
      <div className="grid gap-4 md:grid-cols-2">
        <Board title="Heute" rows={profit(today)} tone />
        <Board title="Diese Woche" rows={profit(week)} tone />
        <Board title="Guthaben" rows={rich.map((u) => ({ name: u.username, value: coins(u.balance) }))} />
        <Board title="Level" rows={xp.map((u) => ({ name: u.username, value: `Level ${levelOf(u.xp)}` }))} />
      </div>
    </>
  );
}
