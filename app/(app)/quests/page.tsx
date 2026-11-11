import { claimQuestAction } from '@/app/actions/account';
import { FormButton } from '@/components/FormButton';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { questStatus } from '@/lib/quests';

export default async function QuestsPage() {
  const user = await requireUser();
  const quests = await questStatus(user.id);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {[false, true].map((weekly) => (
        <section key={String(weekly)}>
          <h2 className="mb-3 text-lg font-bold">{weekly ? 'Wöchentlich' : 'Täglich'}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {quests.filter((q) => q.weekly === weekly).map((q) => (
              <div key={q.key} className="card space-y-3">
                <div>
                  <h3 className="font-bold">{q.title}</h3>
                  <p className="text-sm text-muted">{q.description}</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg">
                  <div className="h-full bg-accent" style={{ width: `${(q.progress / q.target) * 100}%` }} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">{q.progress}/{q.target}</span>
                  <span className="font-mono text-amber-300">{coins(q.reward)} NVC</span>
                </div>
                <FormButton action={claimQuestAction.bind(null, q.key)} className="btn-primary w-full" disabled={q.claimed || q.progress < q.target}>
                  {q.claimed ? 'Abgeholt ✓' : 'Abholen'}
                </FormButton>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
