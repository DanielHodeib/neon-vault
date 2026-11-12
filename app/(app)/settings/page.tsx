import { changePassword, deleteAccount, updateProfile, updateSettings } from '@/app/actions/account';
import { AccentPicker } from '@/components/AccentPicker';
import { ImageField } from '@/components/ImageField';
import { ActionForm, PageHeader, Section, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins, THEME_INFO, THEMES } from '@/lib/format';
import { db } from '@/lib/hub';
import { effectiveLimit, limitPending } from '@/lib/limits';
import { RANKS, rankAllowed } from '@/lib/ranks';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Einstellungen') };
}

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
  const t = await getT();
  const user = await requireUser();
  const pendingLimit = limitPending(user);
  const ownerFriend = (await db.friendship.count({
    where: { accepted: true, OR: [{ fromId: user.id, to: { role: 'OWNER' } }, { toId: user.id, from: { role: 'OWNER' } }] },
  })) > 0;
  const ranks = RANKS.filter((r) => rankAllowed(r, user.xp, Number(user.balance), ownerFriend));

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={t('Profil')} pad>
          <ActionForm action={updateProfile} className="space-y-4">
            <ImageField kind="avatar" name="avatarUrl" label="Avatar" initial={user.avatarUrl} />
            <ImageField kind="banner" name="bannerUrl" label="Banner" initial={user.bannerUrl} />
            <div>
              <label className="label">{t('Über mich')}</label>
              <textarea className="input h-auto py-2" name="bio" maxLength={240} rows={3} defaultValue={user.bio} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <label className="label">{t('Clan-Tag')}</label>
                <input className="input uppercase" name="clanTag" maxLength={5} defaultValue={user.clanTag ?? ''} />
              </div>
              <div>
                <label className="label">{t('Chat-Farbe')}</label>
                <input className="h-10 w-full cursor-pointer rounded-lg border border-line bg-bg p-1 sm:w-14" type="color" name="chatColor" defaultValue={user.chatColor ?? '#e8eaed'} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label">{t('Angezeigter Rang')}</label>
                <select className="input" name="rankTag" defaultValue={user.rankTag}>
                  {ranks.map((r) => <option key={r.tag} value={r.tag}>{r.tag.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            <SubmitButton>{t('Profil speichern')}</SubmitButton>
          </ActionForm>
        </Section>

        <div className="space-y-4">
          <Section title={t('Darstellung & Privatsphäre')} pad>
            <ActionForm action={updateSettings} className="space-y-4">
              <div>
                <label className="label">Theme</label>
                <div className="flex flex-wrap gap-2">
                  {THEMES.map((th) => (
                    <label key={th} className="cursor-pointer">
                      <input type="radio" name="theme" value={th} defaultChecked={user.theme === th} className="peer sr-only" />
                      <span className="chip gap-2 peer-checked:border-accent peer-checked:text-fg">
                        <span className="h-3 w-3 rounded-full" style={{ background: THEME_INFO[th].color }} />
                        {t(THEME_INFO[th].name)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <AccentPicker value={user.accent} />
              <div className="divide-y divide-line border-y border-line">
                <Toggle name="soundEnabled" label={t('Ton bei Erwähnungen')} hint={t('Wenn jemand @deinName im Chat schreibt')} checked={user.soundEnabled} />
                <Toggle name="publicProfile" label={t('Öffentliches Profil')} checked={user.publicProfile} />
                <Toggle name="showBalance" label={t('Guthaben im Profil zeigen')} checked={user.showBalance} />
                <Toggle name="showHistory" label={t('Letzte Spiele im Profil zeigen')} checked={user.showHistory} />
              </div>
              <div>
                <label className="label" htmlFor="dailyLimit">{t('Tageslimit für Einsätze (Selbstschutz)')}</label>
                <input id="dailyLimit" className="input num" name="dailyLimit" type="number" inputMode="numeric" min={100} placeholder={t('leer = kein Limit')} defaultValue={(pendingLimit ? user.dailyLimitNext : effectiveLimit(user))?.toString() ?? ''} />
                <p className="mt-1 text-xs text-faint">{t('Zählt alle Einsätze und Poker-Buy-ins ab Mitternacht (UTC). Senken gilt sofort, Erhöhen oder Entfernen erst nach 24 Stunden.')}</p>
                {pendingLimit && (
                  <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
                    {t('Aktuell gilt {n} NVC. Ab {date}:', { n: coins(effectiveLimit(user) ?? 0), date: user.dailyLimitNextAt!.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) })}{' '}
                    {user.dailyLimitNext === null ? t('kein Limit') : `${coins(user.dailyLimitNext)} NVC`}.
                  </p>
                )}
              </div>
              <SubmitButton>{t('Speichern')}</SubmitButton>
            </ActionForm>
          </Section>

          <Section title={t('Passwort ändern')} pad>
            <ActionForm action={changePassword} className="space-y-3">
              <input className="input" type="password" name="current" placeholder={t('Aktuelles Passwort')} autoComplete="current-password" required />
              <input className="input" type="password" name="next" placeholder={t('Neues Passwort (mind. 8 Zeichen)')} autoComplete="new-password" required />
              <SubmitButton className="btn-secondary">{t('Passwort ändern')}</SubmitButton>
            </ActionForm>
          </Section>

          <Section title={t('Konto löschen')} pad>
            <ActionForm action={deleteAccount} className="space-y-3">
              <p className="text-sm text-muted">{t('Löscht Guthaben, Freunde und Tickets endgültig.')}</p>
              <input className="input" type="password" name="password" placeholder={t('Passwort zur Bestätigung')} required />
              <SubmitButton className="btn-danger">{t('Endgültig löschen')}</SubmitButton>
            </ActionForm>
          </Section>
        </div>
      </div>
    </>
  );
}
