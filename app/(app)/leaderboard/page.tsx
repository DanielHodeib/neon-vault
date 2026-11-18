import { Crown } from 'lucide-react';
import Link from 'next/link';

import { Avatar, Empty, PageHeader, UserLink } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { getT } from '@/lib/i18nServer';
import { db } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { netProfitSince, startOfDay, startOfWeek } from '@/lib/wallet';

export async function generateMetadata() {
  return { title: (await getT())('Bestenliste') };
}

type Row = { name: string; value: string; raw: number; positive?: boolean };
const TABS = [
  { key: 'today', label: 'Heute' },
  { key: 'week', label: 'Diese Woche' },
  { key: 'balance', label: 'Guthaben' },
  { key: 'level', label: 'Level' },
] as const;
const MEDAL = ['from-amber-300/25 to-amber-500/5 border-amber-300/50', 'from-slate-200/20 to-slate-400/5 border-slate-300/40', 'from-orange-400/20 to-orange-700/5 border-orange-400/40'];
const MEDAL_TEXT = ['text-amber-300', 'text-slate-200', 'text-orange-400'];

const profit = (rows: { username: string; profit: number }[]): Row[] =>
  rows.map((r) => ({ name: r.username, raw: r.profit, value: `${r.profit >= 0 ? '+' : ''}${coins(r.profit)}`, positive: r.profit >= 0 }));

export default async function LeaderboardPage({ searchParams }: PageProps<'/leaderboard'>) {
  const t = await getT();
  const me = await requireUser();
  const wanted = (await searchParams).tab;
  const tab = TABS.find((x) => x.key === wanted)?.key ?? 'today';

  let rows: Row[];
  let tone = false;
  if (tab === 'today' || tab === 'week') {
    rows = profit(await netProfitSince(tab === 'today' ? startOfDay() : startOfWeek()));
    tone = true;
  } else if (tab === 'balance') {
    rows = (await db.user.findMany({ orderBy: { balance: 'desc' }, take: 10, select: { username: true, balance: true } })).map((u) => ({ name: u.username, raw: Number(u.balance), value: coins(u.balance) }));
  } else {
    rows = (await db.user.findMany({ orderBy: { xp: 'desc' }, take: 10, select: { username: true, xp: true } })).map((u) => ({ name: u.username, raw: u.xp, value: t('Level {n}', { n: levelOf(u.xp) }) }));
  }
  const looks = new Map((await db.user.findMany({ where: { username: { in: rows.map((r) => r.name) } }, select: { username: true, avatarUrl: true, frame: true, clanTag: true } })).map((u) => [u.username, u]));
  const peak = Math.max(1, ...rows.map((r) => Math.abs(r.raw)));
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  // podium order: 2nd, 1st, 3rd
  const podium = [1, 0, 2].filter((i) => top[i]);

  return (
    <>
      <PageHeader title="Bestenliste" subtitle="Gewinn zählt Einsätze und Auszahlungen aus allen Spielen." />
      <nav className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" aria-label="Bestenliste">
        {TABS.map((x) => (
          <Link key={x.key} href={`/leaderboard?tab=${x.key}`} className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${x.key === tab ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}>
            {t(x.label)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <section className="panel"><Empty>Noch keine Daten.</Empty></section>
      ) : (
        <div className="space-y-4">
          <div key={tab} className="stagger grid grid-cols-3 items-end gap-2 sm:gap-4">
            {podium.map((i) => {
              const r = top[i];
              const look = looks.get(r.name);
              return (
                <div key={r.name} className={`panel relative flex flex-col items-center gap-1.5 border bg-gradient-to-b px-2 pb-4 text-center ${MEDAL[i]} ${i === 0 ? 'pt-7 sm:pb-6' : 'pt-5'}`}>
                  {i === 0 && <Crown size={22} className="absolute -top-3 text-amber-300 drop-shadow-[0_0_8px_#fcd34d88]" aria-hidden />}
                  <span className={`num text-xs font-bold ${MEDAL_TEXT[i]}`}>#{i + 1}</span>
                  <Avatar url={look?.avatarUrl} name={r.name} size={i === 0 ? 64 : 48} frame={look?.frame} />
                  <p className={`max-w-full truncate text-sm font-semibold ${r.name === me.username ? 'text-accent' : ''}`}>
                    {look?.clanTag && <span className="text-faint">[{look.clanTag}] </span>}
                    <UserLink name={r.name} />
                  </p>
                  <p className={`num text-sm font-semibold sm:text-base ${tone ? (r.positive ? 'text-win' : 'text-loss') : MEDAL_TEXT[i]}`}>{r.value}</p>
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <section className="panel">
              <ol className="stagger divide-y divide-line">
                {rest.map((r, i) => {
                  const look = looks.get(r.name);
                  return (
                    <li key={r.name} className={`relative flex items-center gap-3 overflow-hidden px-4 py-2.5 text-sm ${r.name === me.username ? 'bg-accent/5' : ''}`}>
                      <span className="num w-5 text-center text-xs text-faint">{i + 4}</span>
                      <Avatar url={look?.avatarUrl} name={r.name} size={28} frame={look?.frame} />
                      <span className="min-w-0 flex-1 truncate">
                        {look?.clanTag && <span className="text-xs text-faint">[{look.clanTag}] </span>}
                        <UserLink name={r.name} />
                      </span>
                      <span className="relative hidden h-1.5 w-28 overflow-hidden rounded-full bg-raised sm:block">
                        <span className={`grow-x absolute inset-y-0 left-0 rounded-full ${tone ? (r.positive ? 'bg-win/70' : 'bg-loss/70') : 'bg-accent/60'}`} style={{ width: `${Math.max(4, (Math.abs(r.raw) / peak) * 100)}%` }} />
                      </span>
                      <span className={`num w-24 text-right ${tone ? (r.positive ? 'text-win' : 'text-loss') : 'text-muted'}`}>{r.value}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      )}
    </>
  );
}
