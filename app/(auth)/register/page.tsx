import Link from 'next/link';

import { register } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/ui';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Registrieren') };
}

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const t = await getT();
  const { ref } = (await searchParams) as { ref?: string };
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('Konto erstellen')}</h1>
      <p className="mt-1 text-sm text-muted">{t('Du startest mit 10.000 NVC. Alles ist Spielgeld, es gibt keine Auszahlung.')}</p>
      {ref && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{t('Eingeladen von {name}: ihr bekommt beide 2.500 NVC Bonus.', { name: ref })}</p>}

      <ActionForm action={register} className="mt-8 space-y-3">
        {ref && <input type="hidden" name="ref" value={ref} />}
        <div>
          <label className="label" htmlFor="username">{t('Benutzername')}</label>
          <input id="username" className="input" name="username" placeholder={t('3–20 Zeichen')} autoComplete="username" autoCapitalize="off" required />
        </div>
        <div>
          <label className="label" htmlFor="password">{t('Passwort')}</label>
          <input id="password" className="input" name="password" type="password" placeholder={t('mindestens 8 Zeichen')} autoComplete="new-password" required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">{t('Passwort wiederholen')}</label>
          <input id="confirm" className="input" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        <label className="flex items-start gap-2.5 pt-1 text-xs text-muted">
          <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span>
            {t('Ich akzeptiere die')} <Link href="/agb" className="text-fg underline">{t('AGB')}</Link> {t('und die')} <Link href="/datenschutz" className="text-fg underline">{t('Datenschutzerklärung')}</Link>.
          </span>
        </label>
        <SubmitButton className="btn-primary mt-2 w-full">{t('Konto erstellen')}</SubmitButton>
      </ActionForm>

      <p className="mt-6 text-sm text-muted">
        {t('Schon dabei?')} <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">{t('Anmelden')}</Link>
      </p>
    </>
  );
}
