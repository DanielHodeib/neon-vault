import { changePassword, deleteAccount, updateProfile, updateSettings } from '@/app/actions/account';
import { ImageField } from '@/components/ImageField';
import { ActionForm, PageHeader, Section, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { THEMES } from '@/lib/format';
import { db } from '@/lib/hub';
import { RANKS, rankAllowed } from '@/lib/ranks';

export const metadata = { title: 'Einstellungen' };

const THEME_NAMES: Record<string, [string, string]> = {
  neon: ['Mint', '#3ddc97'],
  steel: ['Stahl', '#a5b4c8'],
  sunset: ['Sunset', '#ff8a4c'],
  ocean: ['Ozean', '#4cc2ff'],
  matrix: ['Lime', '#b4f04a'],
};

function Toggle({ name, label, hint, checked }: { name: string; label: string; hint?: string; checked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={checked} className="peer sr-only" />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition peer-checked:bg-accent after:absolute after:top-1 after:left-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50" />
    </label>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const ownerFriend = (await db.friendship.count({
    where: { accepted: true, OR: [{ fromId: user.id, to: { role: 'OWNER' } }, { toId: user.id, from: { role: 'OWNER' } }] },
  })) > 0;
  const ranks = RANKS.filter((r) => rankAllowed(r, user.xp, Number(user.balance), ownerFriend));

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title="Profil" pad>
          <ActionForm action={updateProfile} className="space-y-4">
            <ImageField kind="avatar" name="avatarUrl" label="Avatar" initial={user.avatarUrl} />
            <ImageField kind="banner" name="bannerUrl" label="Banner" initial={user.bannerUrl} />
            <div>
              <label className="label">Über mich</label>
              <textarea className="input h-auto py-2" name="bio" maxLength={240} rows={3} defaultValue={user.bio} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <label className="label">Clan-Tag</label>
                <input className="input uppercase" name="clanTag" maxLength={5} defaultValue={user.clanTag ?? ''} />
              </div>
              <div>
                <label className="label">Chat-Farbe</label>
                <input className="h-10 w-full cursor-pointer rounded-lg border border-line bg-bg p-1 sm:w-14" type="color" name="chatColor" defaultValue={user.chatColor ?? '#e8eaed'} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Angezeigter Rang</label>
                <select className="input" name="rankTag" defaultValue={user.rankTag}>
                  {ranks.map((r) => <option key={r.tag} value={r.tag}>{r.tag.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            <SubmitButton>Profil speichern</SubmitButton>
          </ActionForm>
        </Section>

        <div className="space-y-4">
          <Section title="Darstellung & Privatsphäre" pad>
            <ActionForm action={updateSettings} className="space-y-4">
              <div>
                <label className="label">Akzentfarbe</label>
                <div className="flex flex-wrap gap-2">
                  {THEMES.map((t) => (
                    <label key={t} className="cursor-pointer">
                      <input type="radio" name="theme" value={t} defaultChecked={user.theme === t} className="peer sr-only" />
                      <span className="chip gap-2 peer-checked:border-accent peer-checked:text-fg">
                        <span className="h-3 w-3 rounded-full" style={{ background: THEME_NAMES[t][1] }} />
                        {THEME_NAMES[t][0]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-line border-y border-line">
                <Toggle name="soundEnabled" label="Ton bei Erwähnungen" hint="Wenn jemand @deinName im Chat schreibt" checked={user.soundEnabled} />
                <Toggle name="publicProfile" label="Öffentliches Profil" checked={user.publicProfile} />
                <Toggle name="showBalance" label="Guthaben im Profil zeigen" checked={user.showBalance} />
                <Toggle name="showHistory" label="Letzte Spiele im Profil zeigen" checked={user.showHistory} />
              </div>
              <SubmitButton>Speichern</SubmitButton>
            </ActionForm>
          </Section>

          <Section title="Passwort ändern" pad>
            <ActionForm action={changePassword} className="space-y-3">
              <input className="input" type="password" name="current" placeholder="Aktuelles Passwort" autoComplete="current-password" required />
              <input className="input" type="password" name="next" placeholder="Neues Passwort (mind. 8 Zeichen)" autoComplete="new-password" required />
              <SubmitButton className="btn-secondary">Passwort ändern</SubmitButton>
            </ActionForm>
          </Section>

          <Section title="Konto löschen" pad>
            <ActionForm action={deleteAccount} className="space-y-3">
              <p className="text-sm text-muted">Löscht Guthaben, Freunde und Tickets endgültig.</p>
              <input className="input" type="password" name="password" placeholder="Passwort zur Bestätigung" required />
              <SubmitButton className="btn-danger">Endgültig löschen</SubmitButton>
            </ActionForm>
          </Section>
        </div>
      </div>
    </>
  );
}
