import Link from 'next/link';
import { trollAction, uploadFxAsset } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { MoodForm } from './MoodForm';
import { DiscoSoundSelect, FxComposer } from './FxComposer';
import { ActionForm, Section, SubmitButton } from '@/components/ui';
import { FX } from '@/lib/fx';
import { currentMood, db } from '@/lib/hub';
import { PlayerSearch, findUsers } from './shared';

export async function FunTab({ q, selectedId }: { q: string; selectedId?: string }) {
  const [users, target, assets, settings] = await Promise.all([
    findUsers(q),
    selectedId ? db.user.findUnique({ where: { id: selectedId }, select: { id: true, username: true } }) : null,
    db.fxAsset.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, name: true } }),
    db.systemSettings.findUnique({ where: { id: 1 }, select: { discoSoundId: true } }),
  ]);
  const to = target?.id ?? null;
  const sounds = assets.filter((a) => a.kind === 'sound');
  const images = assets.filter((a) => a.kind === 'image');
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Section
          title={target ? `Effekte für ${target.username}` : 'Effekte für alle'}
          action={target && <Link href="/admin?tab=fun" className="text-xs text-muted hover:text-fg">An alle senden</Link>}
          pad
        >
          <p className="mb-4 text-sm text-muted">Harmloser Spaß: verändert nur kurz, wie die Seite aussieht oder klingt. Rechts einen Spieler wählen, um nur ihn zu trollen.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(FX).map(([key, fx]) => (
              <FormButton key={key} action={trollAction.bind(null, key, to)} className="btn-secondary h-auto flex-col gap-1 py-4">
                <span className="text-2xl">{fx.emoji}</span>
                <span className="text-xs">{fx.label}</span>
              </FormButton>
            ))}
          </div>
          <DiscoSoundSelect sounds={sounds} value={settings?.discoSoundId ?? null} />
        </Section>

        <Section title={target ? `Stimmung für ${target.username}` : 'Stimmung'} pad>
          <p className="mb-4 text-sm text-muted">Bleibt so lange, wie du einstellst – auch für Spieler, die später dazukommen.</p>
          <MoodForm to={to} toName={target?.username} current={currentMood()} />
        </Section>

        <Section title={target ? `Sound & Bild für ${target.username}` : 'Sound & Bild abspielen'} pad>
          <FxComposer to={to} toName={target?.username} sounds={sounds} images={images} />
        </Section>

        <Section title="Sound oder Bild hochladen" pad>
          <ActionForm action={uploadFxAsset} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className="input" name="name" maxLength={40} placeholder="Name, z. B. fahh" />
            <input className="input py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-raised file:px-2 file:py-1 file:text-fg" type="file" name="file" accept="audio/*,image/*" required />
            <SubmitButton className="btn-primary">Hochladen</SubmitButton>
          </ActionForm>
          <p className="mt-2 text-xs text-faint">MP3, OGG, WAV, M4A oder JPG, PNG, WebP, GIF · max. 2 MB. Wird nur auf deinem Server gespeichert.</p>
        </Section>
      </div>
      <PlayerSearch tab="fun" q={q} selectedId={selectedId} users={users} />
    </div>
  );
}
