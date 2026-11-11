import { Check } from 'lucide-react';

import { Empty, PageHeader, Section, Stat } from '@/components/ui';
import { achievements } from '@/lib/achievements';
import { requireUser } from '@/lib/auth';
import { coins, GAME_NAMES } from '@/lib/format';
import { dailyNet, playerStats } from '@/lib/stats';

export const metadata = { title: 'Statistik' };

const signed = (n: number) => `${n > 0 ? '+' : ''}${coins(n)}`;

export default async function StatsPage() {
  const user = await requireUser();
  const [{ games, stats }, days] = await Promise.all([playerStats(user.id), dailyNet(user.id)]);
  const rows = [...games].filter(([, g]) => g.staked > 0).sort((a, b) => b[1].staked - a[1].staked);
  const staked = rows.reduce((s, [, g]) => s + g.staked, 0);
  const net = rows.reduce((s, [, g]) => s + g.net, 0);
  const peak = Math.max(1, ...days.map((d) => Math.abs(d.net)));

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
          <div className="flex h-40 items-center gap-1">
            {days.map((d) => (
              <div key={d.day} className="flex h-full flex-1 flex-col justify-center" title={`${new Date(d.day).toLocaleDateString('de-DE')}: ${signed(d.net)} NVC`}>
                <div className="flex h-1/2 items-end">
                  {d.net > 0 && <div className="w-full rounded-t bg-win/70" style={{ height: `${(d.net / peak) * 100}%` }} />}
                </div>
                <div className="h-px bg-line" />
                <div className="flex h-1/2 items-start">
                  {d.net < 0 && <div className="w-full rounded-b bg-loss/70" style={{ height: `${(-d.net / peak) * 100}%` }} />}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-faint">
            <span>{new Date(days[0].day).toLocaleDateString('de-DE')}</span>
            <span>heute</span>
          </div>
        </Section>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Section title="Nach Spiel">
            {rows.length === 0 && <Empty>Noch nichts gespielt.</Empty>}
            <ul className="divide-y divide-line">
              {rows.map(([game, g]) => (
                <li key={game} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 text-sm">
                  <span>
                    {GAME_NAMES[game] ?? game} <span className="text-xs text-faint">· {g.rounds} Runden</span>
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
                    <span className="block font-medium">{a.title}</span>
                    <span className="text-xs text-muted">{a.description}</span>
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
