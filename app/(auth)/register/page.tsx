import Link from 'next/link';

import { register } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/ui';

export default function RegisterPage() {
  return (
    <ActionForm action={register} className="card space-y-4">
      <h2 className="text-lg font-bold">Konto erstellen</h2>
      <p className="text-sm text-muted">Du startest mit 10.000 NVC. Alles ist Spielgeld – es gibt keine Echtgeld-Auszahlung.</p>
      <input className="input" name="username" placeholder="Benutzername (3–20 Zeichen)" autoComplete="username" required />
      <input className="input" name="password" type="password" placeholder="Passwort (min. 8 Zeichen)" autoComplete="new-password" required />
      <input className="input" name="confirm" type="password" placeholder="Passwort wiederholen" autoComplete="new-password" required />
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" required className="mt-0.5" />
        <span>
          Ich akzeptiere die <Link href="/agb" className="text-accent">AGB</Link> und die <Link href="/datenschutz" className="text-accent">Datenschutzerklärung</Link>.
        </span>
      </label>
      <SubmitButton className="btn-primary w-full">Registrieren</SubmitButton>
      <p className="text-center text-sm text-muted">
        Schon dabei? <Link href="/login" className="text-accent">Einloggen</Link>
      </p>
    </ActionForm>
  );
}
