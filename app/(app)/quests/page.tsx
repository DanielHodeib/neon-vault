import { Check, Gift } from 'lucide-react';

import { claimQuestAction } from '@/app/actions/account';
import { FormButton } from '@/components/FormButton';
import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { questStatus } from '@/lib/quests';
import { startOfDay, startOfWeek } from '@/lib/wallet';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Quests') };
}

/** "5 Std." / "2 Tage": time until the period ends. */
function endsIn(start: Date, days: number, t: (s: string, v?: Record<string, string | number>) => string) {
  const ms = start.getTime() + days * 86_400_000 - Date.now();
  const h = Math.max(1, Math.round(ms / 3_600_000));
  return h < 48 ? t('{n} Std.', { n: h }) : t('{n} Tage', { n: Math.round(h / 24) });
}

export default async function QuestsPage() {
  const t = await getT();
  const user = await requireUser();
  const quests = await questStatus(user.id);
  return (
    <>
      <PageHeader title="Quests" subtitle="Jeden Tag und jede Woche gibt es neue Quests. Wer alle schafft, bekommt einen Bonus." />
      <div className="space-y-8">
        {[false, true].map((weekly) => (
          <section key={String(weekly)}>
            <h2 className="eyebrow mb-3 flex items-center justify-between">
              <span>{weekly ? t('Wöchentlich') : t('Täglich')}</span>
              <span className="normal-case tracking-normal">{t('Neue Quests in {n}', { n: endsIn(weekly ? startOfWeek() : startOfDay(), weekly ? 7 : 1, t) })}</span>
            </h2>
            <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quests.filter((q) => q.weekly === weekly).map((q) => {
                const done = q.progress >= q.target;
                const bonus = q.key.endsWith('_all');
                return (
                  <div key={q.key} className={`card flex flex-col gap-4 ${bonus ? 'border-gold/40 bg-gold/5' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-1.5 font-medium">
                          {bonus && <Gift size={15} className="text-gold" />}
                          {t(q.title)}
                        </h3>
                        <p className="mt-0.5 text-sm text-muted">{t(q.description)}</p>
                      </div>
                      <span className="num shrink-0 text-sm text-gold">+{coins(q.reward)}</span>
                    </div>
                    <div className="mt-auto space-y-2">
                      <div className="flex justify-between text-xs text-muted">
                        <span>{t('Fortschritt')}</span>
                        <span className="num">{q.progress}/{q.target}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                        <div className={`grow-x h-full rounded-full ${done ? 'bg-accent' : 'bg-faint'}`} style={{ width: `${(q.progress / q.target) * 100}%` }} />
                      </div>
                    </div>
                    {q.claimed ? (
                      <p className="flex h-10 items-center justify-center gap-1.5 text-sm text-win"><Check size={16} /> {t('Abgeholt')}</p>
                    ) : (
                      <FormButton action={claimQuestAction.bind(null, q.key)} className="btn-primary w-full" disabled={!done}>
                        {done ? t('Belohnung abholen') : t('Noch nicht erfüllt')}
                      </FormButton>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
