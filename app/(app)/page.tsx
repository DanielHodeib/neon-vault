import { Crown } from 'lucide-react';
import Link from 'next/link';

import { DailySpin } from '@/components/DailySpin';
import { LobbyGames, LobbyLive } from '@/components/Lobby';
import { levelOf } from '@/lib/ranks';
import { Empty } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins, GAME_NAMES, timeAgo } from '@/lib/format';
import { db } from '@/lib/hub';
import { dailyStatus } from '@/lib/daily';
import { netProfitSince, startOfDay } from '@/lib/wallet';
import { getT } from '@/lib/i18nServer';

const BIG_WIN = 5_000;


export default async function Lobby() {
  const t = await getT();
  const user = await requireUser();
  const [today, daily, bigWins] = await Promise.all([
    netProfitSince(startOfDay(), 5),
    dailyStatus(user.id),
    db.ledgerEntry.findMany({
      where: { kind: 'WIN', amount: { gte: BIG_WIN } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, amount: true, game: true, createdAt: true, user: { select: { username: true } } },
    }),
  ]);
  const king = today.find((t) => t.profit > 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      <DailySpin username={user.username} claimedToday={daily.claimedToday} streak={daily.streak} level={levelOf(user.xp)} levelProgress={(user.xp % 1000) / 1000}>
        <LobbyLive king={king ? { username: king.username, profit: king.profit } : null} />
      </DailySpin>

      <LobbyGames />

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold">{t('Heute vorne')}</h2>
            {king && (
              <span className="flex items-center gap-1.5 text-xs text-gold">
                <Crown size={14} /> {king.username}
              </span>
            )}
          </div>
          {today.length === 0 ? (
            <Empty>Heute hat noch niemand gespielt.</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {today.map((t, i) => (
                <li key={t.userId} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="num w-4 text-faint">{i + 1}</span>
                    <Link href={`/profile/${t.username}`} className="hover:text-accent">{t.username}</Link>
                  </span>
                  <span className={`num ${t.profit >= 0 ? 'text-win' : 'text-loss'}`}>{t.profit >= 0 ? '+' : ''}{coins(t.profit)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">{t('Große Gewinne')}</h2>
          {bigWins.length === 0 ? (
            <Empty>Noch keine großen Gewinne – sei der Erste.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {bigWins.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 truncate">
                    <Link href={`/profile/${w.user.username}`} className="hover:text-accent">{w.user.username}</Link>
                    <span className="text-faint"> · {t(GAME_NAMES[w.game ?? ''] ?? w.game ?? '')} · {t(timeAgo(w.createdAt))}</span>
                  </span>
                  <span className="num shrink-0 text-gold">+{coins(w.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
