import { Check } from 'lucide-react';

import { claimQuestAction } from '@/app/actions/account';
import { FormButton } from '@/components/FormButton';
import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { questStatus } from '@/lib/quests';

export const metadata = { title: 'Quests' };

export default async function QuestsPage() {
  const user = await requireUser();
  const quests = await questStatus(user.id);
  return (
    <>
      <PageHeader title="Quests" subtitle="Tägliche Quests starten um Mitternacht (UTC) neu, wöchentliche am Montag." />
      <div className="space-y-8">
        {[false, true].map((weekly) => (
          <section key={String(weekly)}>
            <h2 className="eyebrow mb-3">{weekly ? 'Wöchentlich' : 'Täglich'}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quests.filter((q) => q.weekly === weekly).map((q) => {
                const done = q.progress >= q.target;
                return (
                  <div key={q.key} className="card flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{q.title}</h3>
                        <p className="mt-0.5 text-sm text-muted">{q.description}</p>
                      </div>
                      <span className="num shrink-0 text-sm text-gold">+{coins(q.reward)}</span>
                    </div>
                    <div className="mt-auto space-y-2">
                      <div className="flex justify-between text-xs text-muted">
                        <span>Fortschritt</span>
                        <span className="num">{q.progress}/{q.target}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                        <div className={`h-full rounded-full ${done ? 'bg-accent' : 'bg-faint'}`} style={{ width: `${(q.progress / q.target) * 100}%` }} />
                      </div>
                    </div>
                    {q.claimed ? (
                      <p className="flex h-10 items-center justify-center gap-1.5 text-sm text-win"><Check size={16} /> Abgeholt</p>
                    ) : (
                      <FormButton action={claimQuestAction.bind(null, q.key)} className="btn-primary w-full" disabled={!done}>
                        {done ? 'Belohnung abholen' : 'Noch nicht erfüllt'}
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
