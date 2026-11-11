import { changePassword, deleteAccount, updateProfile, updateSettings } from '@/app/actions/account';
import { ActionForm, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { THEMES } from '@/lib/format';
import { db } from '@/lib/hub';
import { RANKS, rankAllowed } from '@/lib/ranks';

const THEME_NAMES: Record<string, string> = { neon: 'Neon', steel: 'Stahl', sunset: 'Sunset', ocean: 'Ozean', matrix: 'Matrix' };

export default async function SettingsPage() {
  const user = await requireUser();
  const ownerFriend = (await db.friendship.count({
    where: { accepted: true, OR: [{ fromId: user.id, to: { role: 'OWNER' } }, { toId: user.id, from: { role: 'OWNER' } }] },
  })) > 0;
  const ranks = RANKS.filter((r) => rankAllowed(r, user.xp, Number(user.balance), ownerFriend));

  const toggle = (name: string, label: string, checked: boolean) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label} <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4" />
    </label>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
      <ActionForm action={updateProfile} className="card space-y-3">
        <h2 className="font-bold">Profil</h2>
        <div>
          <label className="label">Avatar-URL</label>
          <input className="input" name="avatarUrl" defaultValue={user.avatarUrl ?? ''} placeholder="https://…" />
        </div>
        <div>
          <label className="label">Banner-URL</label>
          <input className="input" name="bannerUrl" defaultValue={user.bannerUrl ?? ''} placeholder="https://…" />
        </div>
        <div>
          <label className="label">Bio</label>
          <textarea className="input" name="bio" maxLength={240} rows={3} defaultValue={user.bio} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Clan-Tag</label>
            <input className="input uppercase" name="clanTag" maxLength={5} defaultValue={user.clanTag ?? ''} />
          </div>
          <div>
            <label className="label">Chat-Farbe</label>
            <input className="input h-10 p-1" type="color" name="chatColor" defaultValue={user.chatColor ?? '#e2e8f0'} />
          </div>
          <div>
            <label className="label">Rang</label>
            <select className="input" name="rankTag" defaultValue={user.rankTag}>
              {ranks.map((r) => <option key={r.tag} value={r.tag}>{r.tag.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <SubmitButton>Speichern</SubmitButton>
      </ActionForm>

      <div className="space-y-4">
        <ActionForm action={updateSettings} className="card space-y-3">
          <h2 className="font-bold">Einstellungen</h2>
          <div>
            <label className="label">Farbschema</label>
            <select className="input" name="theme" defaultValue={user.theme}>
              {THEMES.map((t) => <option key={t} value={t}>{THEME_NAMES[t]}</option>)}
            </select>
          </div>
          {toggle('soundEnabled', 'Ton bei Erwähnungen', user.soundEnabled)}
          {toggle('publicProfile', 'Profil öffentlich', user.publicProfile)}
          {toggle('showBalance', 'Guthaben im Profil zeigen', user.showBalance)}
          {toggle('showHistory', 'Spielverlauf im Profil zeigen', user.showHistory)}
          <SubmitButton>Speichern</SubmitButton>
        </ActionForm>

        <ActionForm action={changePassword} className="card space-y-3">
          <h2 className="font-bold">Passwort ändern</h2>
          <input className="input" type="password" name="current" placeholder="Aktuelles Passwort" autoComplete="current-password" required />
          <input className="input" type="password" name="next" placeholder="Neues Passwort (min. 8)" autoComplete="new-password" required />
          <SubmitButton>Ändern</SubmitButton>
        </ActionForm>

        <ActionForm action={deleteAccount} className="card space-y-3 border-red-500/30">
          <h2 className="font-bold text-red-300">Konto löschen</h2>
          <p className="text-sm text-muted">Löscht dein Konto mit Guthaben, Freunden und Tickets. Das kann nicht rückgängig gemacht werden.</p>
          <input className="input" type="password" name="password" placeholder="Passwort zur Bestätigung" required />
          <SubmitButton className="btn-danger">Endgültig löschen</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
