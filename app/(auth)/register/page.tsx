import Link from 'next/link';

import { register } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/ui';

export const metadata = { title: 'Registrieren' };

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const { ref } = (await searchParams) as { ref?: string };
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Konto erstellen</h1>
      <p className="mt-1 text-sm text-muted">Du startest mit 10.000 NVC. Alles ist Spielgeld, es gibt keine Auszahlung.</p>
      {ref && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">Eingeladen von {ref}: ihr bekommt beide 2.500 NVC Bonus.</p>}

      <ActionForm action={register} className="mt-8 space-y-3">
        {ref && <input type="hidden" name="ref" value={ref} />}
        <div>
          <label className="label" htmlFor="username">Benutzername</label>
          <input id="username" className="input" name="username" placeholder="3–20 Zeichen" autoComplete="username" autoCapitalize="off" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Passwort</label>
          <input id="password" className="input" name="password" type="password" placeholder="mindestens 8 Zeichen" autoComplete="new-password" required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Passwort wiederholen</label>
          <input id="confirm" className="input" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        <label className="flex items-start gap-2.5 pt-1 text-xs text-muted">
          <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span>
            Ich akzeptiere die <Link href="/agb" className="text-fg underline">AGB</Link> und die <Link href="/datenschutz" className="text-fg underline">Datenschutzerklärung</Link>.
          </span>
        </label>
        <SubmitButton className="btn-primary mt-2 w-full">Konto erstellen</SubmitButton>
      </ActionForm>

      <p className="mt-6 text-sm text-muted">
        Schon dabei? <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">Anmelden</Link>
      </p>
    </>
  );
}
