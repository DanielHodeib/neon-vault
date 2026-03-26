import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

const GAME_CARDS: Array<{ title: string; subtitle: string; href: string }> = [
  { title: 'Neon Rocket', subtitle: 'Classic crash with instant cashout', href: '/crash' },
  { title: 'Cyber Aviator', subtitle: 'Parallax flight crash mode', href: '/crash-aviator' },
  { title: 'Slots', subtitle: 'Rapid multi-line spins', href: '/hub?game=slots' },
  { title: 'Blackjack', subtitle: 'Solo bots and friends table', href: '/hub?game=blackjack' },
  { title: 'Roulette', subtitle: 'Single-zero table and live wheel', href: '/hub?game=roulette' },
  { title: 'Poker', subtitle: 'Texas Holdem cash table', href: '/hub?game=poker' },
  { title: 'Coinflip', subtitle: 'Fast 1v1 high-volatility duels', href: '/hub?game=coinflip' },
];

function formatBalance(value: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.max(0, value))} NVC`;
}

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const displayName = session.user.name ?? 'Player';
  const balance = Number(session.user.balance ?? 0);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <div className="rounded-2xl border border-cyan-500/30 bg-[radial-gradient(ellipse_at_top_left,_rgba(34,211,238,0.22),_rgba(2,6,23,0.92)_62%)] p-6 shadow-[0_0_30px_rgba(34,211,238,0.14)] md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Neon Vault</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">Welcome, {displayName}</h1>
          <div className="mt-4 inline-flex items-center rounded-lg border border-cyan-500/40 bg-slate-950/70 px-4 py-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">Balance</span>
            <span className="ml-3 font-mono text-xl font-bold text-cyan-300">{formatBalance(balance)}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/hub"
              className="inline-flex h-10 items-center rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
            >
              Open Main Hub
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex h-10 items-center rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
            >
              View Leaderboard
            </Link>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {GAME_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group rounded-xl border border-slate-800 bg-[linear-gradient(160deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] p-5 transition-all hover:border-cyan-500/40 hover:shadow-[0_0_22px_rgba(34,211,238,0.2)]"
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/80">Game</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-100 transition-colors group-hover:text-cyan-200">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{card.subtitle}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-slate-300">Enter table</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
