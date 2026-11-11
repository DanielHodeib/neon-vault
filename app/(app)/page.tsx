import { Bomb, CircleDot, Cherry, Club, Coins, Crown, Dices, FerrisWheel, PiggyBank, Rocket, Spade, Triangle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { DailySpin } from '@/components/DailySpin';
import { Empty } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins, GAME_NAMES, timeAgo } from '@/lib/format';
import { db } from '@/lib/hub';
import { dailyStatus } from '@/lib/daily';
import { netProfitSince, startOfDay } from '@/lib/wallet';

const BIG_WIN = 5_000;

const GAMES: { slug: string; name: string; text: string; icon: LucideIcon; tint: string }[] = [
  { slug: 'crash', name: 'Crash', text: 'Rechtzeitig aussteigen', icon: Rocket, tint: '#3ddc97' },
  { slug: 'slots', name: 'Slots', text: '8 Automaten', icon: Cherry, tint: '#e4c06a' },
  { slug: 'blackjack', name: 'Blackjack', text: 'Solo oder am Tisch', icon: Spade, tint: '#7aa2ff' },
  { slug: 'roulette', name: 'Roulette', text: 'Europäisch, live', icon: CircleDot, tint: '#ff8a4c' },
  { slug: 'poker', name: 'Poker', text: "Texas Hold'em", icon: Club, tint: '#c084fc' },
  { slug: 'coinflip', name: 'Coinflip', text: 'Spieler gegen Spieler', icon: Coins, tint: '#4cc2ff' },
  { slug: 'mines', name: 'Mines', text: 'Felder aufdecken, Bomben meiden', icon: Bomb, tint: '#f87171' },
  { slug: 'dice', name: 'Dice', text: 'Drüber oder drunter', icon: Dices, tint: '#a5b4c8' },
  { slug: 'plinko', name: 'Plinko', text: 'Kugel fallen lassen', icon: Triangle, tint: '#f472b6' },
  { slug: 'wheel', name: 'Glücksrad', text: 'Alle drehen gemeinsam', icon: FerrisWheel, tint: '#34d399' },
  { slug: 'jackpot', name: 'Jackpot', text: 'Ein Topf, ein Gewinner', icon: PiggyBank, tint: '#fbbf24' },
];

export default async function Lobby() {
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
      <DailySpin username={user.username} claimedToday={daily.claimedToday} streak={daily.streak} />

      <section>
        <h2 className="eyebrow mb-3">Spiele</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {GAMES.map(({ slug, name, text, icon: Icon, tint }) => (
            <Link key={slug} href={`/play/${slug}`} className="panel group relative overflow-hidden p-4 transition hover:border-line-strong sm:p-5">
              <div
                className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-35"
                style={{ background: tint }}
              />
              <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
                <Icon size={20} />
              </span>
              <h3 className="mt-6 font-semibold sm:mt-8">{name}</h3>
              <p className="text-xs text-muted sm:text-sm">{text}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold">Heute vorne</h2>
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
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Große Gewinne</h2>
          {bigWins.length === 0 ? (
            <Empty>Noch keine großen Gewinne – sei der Erste.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {bigWins.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 truncate">
                    <Link href={`/profile/${w.user.username}`} className="hover:text-accent">{w.user.username}</Link>
                    <span className="text-faint"> · {GAME_NAMES[w.game ?? ''] ?? w.game} · {timeAgo(w.createdAt)}</span>
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
