import { Check } from 'lucide-react';
import Link from 'next/link';

import { DailyChart } from '@/components/DailyChart';
import { BalanceCurve, GameDonut, Heatmap, LossRanking, NetBars, type GameRow } from '@/components/stats/charts';
import { Ledger } from '@/components/stats/Ledger';
import { Empty, PageHeader, Section, Stat } from '@/components/ui';
import { achievements, ALL_GAMES } from '@/lib/achievements';
import { requireUser } from '@/lib/auth';
import { coins, gameName } from '@/lib/format';
import { getT } from '@/lib/i18nServer';
import { dailyNet, history, playerStats } from '@/lib/stats';

export async function generateMetadata() {
  return { title: (await getT())('Statistik') };
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${coins(n)}`;
const TABS = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'games', label: 'Spiele' },
  { key: 'when', label: 'Wann' },
  { key: 'ledger', label: 'Buchungen' },
  { key: 'achievements', label: 'Erfolge' },
] as const;

export default async function StatsPage({ searchParams }: PageProps<'/stats'>) {
  const t = await getT();
  const user = await requireUser();
  const wanted = (await searchParams).tab;
  const tab = TABS.find((x) => x.key === wanted)?.key ?? 'overview';
  const [{ games, stats }, days, hist] = await Promise.all([playerStats(user.id), dailyNet(user.id), history(user.id)]);
  const rows: GameRow[] = [...games].filter(([, g]) => g.staked > 0).map(([game, g]) => ({ game, ...g })).sort((a, b) => b.staked - a.staked);
  const staked = rows.reduce((s, r) => s + r.staked, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const lost = rows.filter((r) => r.net < 0).reduce((s, r) => s - r.net, 0);
  const best = [...hist.curve].sort((a, b) => b.net - a.net)[0];
  const worst = [...hist.curve].sort((a, b) => a.net - b.net)[0];

  return (
    <>
      <PageHeader title="Statistik" subtitle="Alles berechnet aus deinen Buchungen." />
      <nav className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" aria-label="Statistik">
        {TABS.map((x) => (
          <Link key={x.key} href={`/stats?tab=${x.key}`} className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${x.key === tab ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}>
            {t(x.label)}
          </Link>
        ))}
      </nav>

      <div className="space-y-4">
        {tab === 'overview' && (
          <>
            <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Runden"><span className="num">{coins(stats.bets)}</span></Stat>
              <Stat label="Eingesetzt"><span className="num">{coins(staked)}</span></Stat>
              <Stat label="Netto"><span className={`num ${net >= 0 ? 'text-win' : 'text-loss'}`}>{signed(net)}</span></Stat>
              <Stat label="Größter Gewinn"><span className="num text-gold">{coins(stats.biggestWin)}</span></Stat>
              <Stat label="Verloren (gesamt)"><span className="num text-loss">{coins(lost)}</span></Stat>
              <Stat label="Größter Einsatz"><span className="num">{coins(hist.biggestStake)}</span></Stat>
              <Stat label="Bester Tag"><span className="num text-win">{best ? signed(best.net) : '–'}</span></Stat>
              <Stat label="Schlechtester Tag"><span className="num text-loss">{worst ? signed(worst.net) : '–'}</span></Stat>
            </div>
            <Section title="Dein Verlauf" pad>
              <BalanceCurve curve={hist.curve} />
            </Section>
            <Section title="Letzte 14 Tage" pad>
              <DailyChart days={days} />
            </Section>
          </>
        )}

        {tab === 'games' &&
          (rows.length === 0 ? (
            <Section title="Nach Spiel"><Empty>Noch nichts gespielt.</Empty></Section>
          ) : (
            <>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <Section title="Wohin dein Einsatz geht" pad>
                  <GameDonut rows={rows} />
                </Section>
                <Section title="Wo du Geld verlierst" pad>
                  <LossRanking rows={rows} />
                </Section>
              </div>
              <Section title="Gewinn und Verlust pro Spiel" pad>
                <NetBars rows={[...rows].sort((a, b) => a.net - b.net)} />
              </Section>
              <Section title="Alle Spiele im Detail">
                <ul className="stagger divide-y divide-line">
                  {rows.map((g) => (
                    <li key={g.game} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 text-sm">
                      <span>
                        {t(gameName(g.game))} <span className="text-xs text-faint">· {t('{n} Runden', { n: g.rounds })}</span>
                      </span>
                      <span className="num text-muted">{coins(g.staked)}</span>
                      <span className={`num w-24 text-right ${g.net >= 0 ? 'text-win' : 'text-loss'}`}>{signed(g.net)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          ))}

        {tab === 'when' && (
          <Section title="Wann du gewinnst und verlierst (30 Tage)" pad>
            <Heatmap heat={hist.heat} rounds={hist.rounds} />
          </Section>
        )}

        {tab === 'ledger' && (
          <Section title="Letzte Buchungen">
            <Ledger rows={hist.ledger} />
          </Section>
        )}

        {tab === 'achievements' && (
          <Section title="Achievements">
            <ul className="stagger divide-y divide-line">
              {achievements(stats).map((a) => (
                <li key={a.key} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${a.done ? '' : 'opacity-45'}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${a.done ? 'bg-gold/15 text-gold' : 'bg-raised text-faint'}`}>
                    <Check size={14} />
                  </span>
                  <span>
                    <span className="block font-medium">{t(a.title)}</span>
                    <span className="text-xs text-muted">{t(a.description, { n: ALL_GAMES })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}
