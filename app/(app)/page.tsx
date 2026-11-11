import Link from 'next/link';

import { claimFaucet } from '@/app/actions/account';
import { FormButton } from '@/components/FormButton';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { db } from '@/lib/hub';
import { netProfitSince, startOfDay } from '@/lib/wallet';

const GAMES = [
  { slug: 'crash', name: 'Crash', emoji: '🚀', text: 'Steig aus, bevor die Rakete explodiert.' },
  { slug: 'aviator', name: 'Aviator', emoji: '✈️', text: 'Crash im Cockpit – gleiche Runde, andere Optik.' },
  { slug: 'slots', name: 'Slots', emoji: '🎰', text: '8 Automaten von Classic bis Treasure Hunt.' },
  { slug: 'blackjack', name: 'Blackjack', emoji: '🃏', text: 'Solo, mit Bots oder mit Freunden am Tisch.' },
  { slug: 'roulette', name: 'Roulette', emoji: '🎡', text: 'Europäisches Roulette, alle setzen gemeinsam.' },
  { slug: 'poker', name: 'Poker', emoji: '♠️', text: "Texas Hold'em gegen Bots oder Freunde." },
  { slug: 'coinflip', name: 'Coinflip', emoji: '🪙', text: 'Kopf oder Zahl – Spieler gegen Spieler.' },
];

export default async function Lobby() {
  const user = await requireUser();
  const [today, faucet] = await Promise.all([
    netProfitSince(startOfDay(), 5),
    db.questClaim.findUnique({ where: { userId_questKey_periodStart: { userId: user.id, questKey: 'faucet', periodStart: startOfDay() } } }),
  ]);
  const king = today.find((t) => t.profit > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="card flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-accent/10 to-accent-2/10">
        <div>
          <h1 className="text-2xl font-black">Willkommen zurück, {user.username}!</h1>
          <p className="text-sm text-muted">Hol dir täglich 5.000 NVC gratis.</p>
        </div>
        <FormButton action={claimFaucet} className="btn-primary" disabled={!!faucet}>
          {faucet ? 'Faucet morgen wieder' : '🎁 5.000 NVC abholen'}
        </FormButton>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g) => (
          <Link key={g.slug} href={`/play/${g.slug}`} className="card group transition hover:-translate-y-0.5 hover:border-accent">
            <div className="text-4xl">{g.emoji}</div>
            <h2 className="mt-3 text-lg font-bold group-hover:text-accent">{g.name}</h2>
            <p className="text-sm text-muted">{g.text}</p>
          </Link>
        ))}
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">Heute vorne {king && <span className="text-amber-300">· 👑 King: {king.username}</span>}</h2>
        {today.length === 0 ? (
          <p className="text-sm text-muted">Heute hat noch niemand gespielt.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {today.map((t, i) => (
              <li key={t.userId} className="flex justify-between">
                <span>{i + 1}. <Link href={`/profile/${t.username}`} className="hover:text-accent">{t.username}</Link></span>
                <span className={`font-mono ${t.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{t.profit >= 0 ? '+' : ''}{coins(t.profit)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
