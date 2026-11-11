import { Empty, PageHeader, Section, UserLink } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { kindOf, msLeftThisWeek, paidWinners, standings, TOURNAMENT_KINDS, TOURNAMENT_PRIZES } from '@/lib/tournament';
import { startOfWeek } from '@/lib/wallet';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Turnier') };
}

const WEEK = 7 * 86_400_000;

export default async function TournamentPage() {
  const t = await getT();
  const me = await requireUser();
  const week = startOfWeek();
  const lastWeek = new Date(week.getTime() - WEEK);
  const kind = TOURNAMENT_KINDS[kindOf(week)];
  const next = TOURNAMENT_KINDS[kindOf(new Date(week.getTime() + WEEK))];
  const [table, everyone, winners] = await Promise.all([standings(week, 10), standings(week, 1000), paidWinners(lastWeek)]);
  const myPlace = everyone.findIndex((s) => s.userId === me.id);
  const left = msLeftThisWeek();
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);

  return (
    <>
      <PageHeader title="Wochen-Turnier" subtitle="Jede Woche eine neue Disziplin. Die besten drei gewinnen automatisch." />

      <section className="panel mb-4 overflow-hidden">
        <div className="bg-[radial-gradient(80%_120%_at_0%_0%,rgba(228,192,106,.18),transparent)] p-5 sm:p-6">
          <p className="eyebrow">Diese Woche</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{t(kind.label)}</h2>
          <p className="mt-1 text-sm text-muted">{t(kind.description)}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {TOURNAMENT_PRIZES.map((p, i) => (
              <div key={i} className="rounded-xl border border-line bg-bg/60 px-3 py-2.5">
                <p className="text-[11px] text-muted">{t('{n}. Platz', { n: i + 1 })}</p>
                <p className="num font-semibold text-gold">{coins(p)} NVC</p>
              </div>
            ))}
            <div className="rounded-xl border border-line bg-bg/60 px-3 py-2.5">
              <p className="text-[11px] text-muted">Endet in</p>
              <p className="num font-semibold">{t('{d} T {h} Std', { d: days, h: hours })}</p>
            </div>
          </div>
          <p className="mt-4 text-sm">
            {myPlace >= 0 ? (
              <>{t('Du bist auf')} <span className="font-semibold text-accent">{t('Platz {n}', { n: myPlace + 1 })}</span> {t('mit')} <span className="num">{coins(everyone[myPlace].score)}</span> {t(kind.unit)}.</>
            ) : (
              <span className="text-muted">{t('Du bist noch nicht dabei – spiel eine Runde, um einzusteigen.')}</span>
            )}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section title="Rangliste">
          {table.length === 0 && <Empty>Noch niemand dabei.</Empty>}
          <ol className="divide-y divide-line">
            {table.map((r, i) => (
              <li key={r.userId} className={`flex items-center justify-between px-4 py-2.5 text-sm ${r.userId === me.id ? 'bg-accent/5' : ''}`}>
                <span className="flex items-center gap-3">
                  <span className={`num w-5 text-center text-xs ${i < 3 ? 'font-semibold text-gold' : 'text-faint'}`}>{i + 1}</span>
                  <UserLink name={r.username} />
                </span>
                <span className="num text-muted">
                  {coins(r.score)} <span className="text-xs text-faint">{t(kind.unit)}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
        <div className="space-y-4">
          <Section title="Letzte Woche">
            {winners.length === 0 && <Empty>Keine Gewinner.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {winners.map((w) => (
                <li key={w.place} className="flex justify-between px-4 py-2.5">
                  <span>{w.place}. <UserLink name={w.username} /></span>
                  <span className="num text-win">+{coins(w.prize)}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Nächste Woche" pad>
            <p className="font-medium">{t(next.label)}</p>
            <p className="text-sm text-muted">{t(next.description)}</p>
          </Section>
        </div>
      </div>
    </>
  );
}
