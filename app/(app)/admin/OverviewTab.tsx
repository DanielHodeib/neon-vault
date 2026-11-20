import { Activity, Coins as CoinsIcon, Trophy, Users, Wifi } from 'lucide-react';
import Link from 'next/link';
import { Empty, Section } from '@/components/ui';
import { adminStats } from '@/lib/adminStats';
import { coins, compact, gameName, timeAgo } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { startOfDay } from '@/lib/wallet';
import { KIND_LABEL, Kpi } from './shared';

export async function OverviewTab() {
  const [userCount, openTickets, totals, betsToday, week, recent, bigWins] = await Promise.all([
    db.user.count(),
    db.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.user.aggregate({ _sum: { balance: true } }),
    db.ledgerEntry.count({ where: { kind: 'BET', createdAt: { gte: startOfDay() } } }),
    adminStats(7),
    db.ledgerEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { user: { select: { username: true } } } }),
    db.ledgerEntry.findMany({ where: { kind: 'WIN', amount: { gte: 5_000 } }, orderBy: { createdAt: 'desc' }, take: 6, include: { user: { select: { username: true } } } }),
  ]);
  const maxRounds = Math.max(1, ...week.games.map((g) => g.rounds));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Spieler" value={coins(userCount)} hint={`${week.newUsers} neu in 7 Tagen`} />
        <Kpi icon={Wifi} label="Online jetzt" value={hub.online.size} hint={`${week.activePlayers} aktiv in 7 Tagen`} tone="win" />
        <Kpi icon={Activity} label="Einsätze heute" value={coins(betsToday)} hint={`${coins(week.rounds)} Runden in 7 Tagen`} />
        <Kpi icon={CoinsIcon} label="NVC im Umlauf" value={compact(totals._sum.balance ?? 0)} tone="gold" hint={`${openTickets} offene Tickets`} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section
          title="Spiele · letzte 7 Tage"
          action={<span className={`num text-xs font-semibold ${week.house >= 0 ? 'text-win' : 'text-loss'}`}>Haus {week.house >= 0 ? '+' : ''}{compact(week.house)}</span>}
        >
          {week.games.length === 0 ? (
            <Empty>Diese Woche wurde noch nicht gespielt.</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {week.games.map((g) => (
                <li key={g.game} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{gameName(g.game)}</span>
                    <span className="num text-xs text-muted">
                      {coins(g.rounds)} Runden · {compact(g.staked)} gesetzt ·{' '}
                      <span className={g.house >= 0 ? 'text-win' : 'text-loss'}>{g.house >= 0 ? '+' : ''}{compact(g.house)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${(g.rounds / maxRounds) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          <Section title={`Wer spielt was · ${hub.online.size}`}>
            {hub.online.size === 0 && <Empty>Gerade niemand online.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {[...hub.online.values()].map((u) => (
                <li key={u.id} className="flex justify-between gap-3 px-4 py-2">
                  <Link href={`/admin?tab=players&user=${u.id}`} className="truncate hover:underline">{u.username}</Link>
                  <span className="shrink-0 text-xs text-faint">{u.activity}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Große Gewinne">
            {bigWins.length === 0 && <Empty>Noch keine.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {bigWins.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="flex min-w-0 items-center gap-2"><Trophy size={13} className="shrink-0 text-gold" /><span className="truncate">{w.user.username}</span></span>
                  <span className="num shrink-0 text-xs"><span className="text-win">+{compact(w.amount)}</span> <span className="text-faint">{gameName(w.game)}</span></span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Section title="Letzte Buchungen">
        <ul className="divide-y divide-line text-sm">
          {recent.map((e) => (
            <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 sm:grid-cols-[10rem_7rem_minmax(0,1fr)_auto]">
              <span className="truncate font-medium">{e.user.username}</span>
              <span className="num text-right sm:order-last">
                <span className={e.amount >= 0n ? 'text-win' : 'text-loss'}>{e.amount >= 0n ? '+' : ''}{coins(e.amount)}</span>
              </span>
              <span className="text-xs text-muted">{KIND_LABEL[e.kind] ?? e.kind}{e.game && ` · ${gameName(e.game)}`}</span>
              <span className="truncate text-xs text-faint">{e.note ?? ''} · {timeAgo(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
