import { Check } from 'lucide-react';

import { Empty, PageHeader, Section, Stat } from '@/components/ui';
import { achievements, ALL_GAMES } from '@/lib/achievements';
import { requireUser } from '@/lib/auth';
import { coins, gameName } from '@/lib/format';
import { dailyNet, playerStats } from '@/lib/stats';
import { DailyChart } from '@/components/DailyChart';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Statistik') };
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${coins(n)}`;

export default async function StatsPage() {
  const t = await getT();
  const user = await requireUser();
  const [{ games, stats }, days] = await Promise.all([playerStats(user.id), dailyNet(user.id)]);
  const rows = [...games].filter(([, g]) => g.staked > 0).sort((a, b) => b[1].staked - a[1].staked);
  const staked = rows.reduce((s, [, g]) => s + g.staked, 0);
  const net = rows.reduce((s, [, g]) => s + g.net, 0);

  return (
    <>
      <PageHeader title="Statistik" subtitle="Alles berechnet aus deinen Buchungen." />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Runden"><span className="num">{coins(stats.bets)}</span></Stat>
          <Stat label="Eingesetzt"><span className="num">{coins(staked)}</span></Stat>
          <Stat label="Netto"><span className={`num ${net >= 0 ? 'text-win' : 'text-loss'}`}>{signed(net)}</span></Stat>
          <Stat label="Größter Gewinn"><span className="num text-gold">{coins(stats.biggestWin)}</span></Stat>
        </div>

        <Section title="Letzte 14 Tage" pad>
          <DailyChart days={days} />
        </Section>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Section title="Nach Spiel">
            {rows.length === 0 && <Empty>Noch nichts gespielt.</Empty>}
            <ul className="divide-y divide-line">
              {rows.map(([game, g]) => (
                <li key={game} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 text-sm">
                  <span>
                    {t(gameName(game))} <span className="text-xs text-faint">· {t('{n} Runden', { n: g.rounds })}</span>
                  </span>
                  <span className="num text-muted">{coins(g.staked)}</span>
                  <span className={`num w-24 text-right ${g.net >= 0 ? 'text-win' : 'text-loss'}`}>{signed(g.net)}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Achievements">
            <ul className="divide-y divide-line">
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
        </div>
      </div>
    </>
  );
}
