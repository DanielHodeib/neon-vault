import { UserLink } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { db } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { netProfitSince, startOfDay, startOfWeek } from '@/lib/wallet';

function Board({ title, rows }: { title: string; rows: { name: string; value: string }[] }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-bold">{title}</h2>
      {rows.length === 0 && <p className="text-sm text-muted">Noch keine Daten.</p>}
      <ol className="space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.name} className="flex justify-between">
            <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} <UserLink name={r.name} /></span>
            <span className="font-mono">{r.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const profit = (p: number) => `${p >= 0 ? '+' : ''}${coins(p)}`;

export default async function LeaderboardPage() {
  await requireUser();
  const [rich, xp, today, week] = await Promise.all([
    db.user.findMany({ orderBy: { balance: 'desc' }, take: 10, select: { username: true, balance: true } }),
    db.user.findMany({ orderBy: { xp: 'desc' }, take: 10, select: { username: true, xp: true } }),
    netProfitSince(startOfDay()),
    netProfitSince(startOfWeek()),
  ]);
  return (
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
      <Board title="💰 Reichste Spieler" rows={rich.map((u) => ({ name: u.username, value: coins(u.balance) }))} />
      <Board title="⭐ Höchstes Level" rows={xp.map((u) => ({ name: u.username, value: `Lvl ${levelOf(u.xp)}` }))} />
      <Board title="👑 Heute (Gewinn)" rows={today.map((t) => ({ name: t.username, value: profit(t.profit) }))} />
      <Board title="📅 Diese Woche (Gewinn)" rows={week.map((t) => ({ name: t.username, value: profit(t.profit) }))} />
    </div>
  );
}
