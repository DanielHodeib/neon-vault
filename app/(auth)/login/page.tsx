import Link from 'next/link';

import { login } from '@/app/actions/auth';
import { createGuestTicket } from '@/app/actions/support';
import { ActionForm, SubmitButton } from '@/components/ui';
import { TICKET_CATEGORIES } from '@/lib/format';

export const metadata = { title: 'Anmelden' };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
      <p className="mt-1 text-sm text-muted">Spiel mit deinen Freunden – nur mit Spielgeld.</p>

      <ActionForm action={login} className="mt-8 space-y-3">
        <div>
          <label className="label" htmlFor="username">Benutzername</label>
          <input id="username" className="input" name="username" autoComplete="username" autoCapitalize="off" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Passwort</label>
          <input id="password" className="input" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn-primary mt-2 w-full">Anmelden</SubmitButton>
      </ActionForm>

      <p className="mt-6 text-sm text-muted">
        Noch kein Konto? <Link href="/register" className="font-medium text-fg underline-offset-4 hover:underline">Registrieren</Link>
      </p>

      <details className="group mt-10 border-t border-line pt-6">
        <summary className="cursor-pointer list-none text-sm text-muted hover:text-fg">Probleme beim Anmelden? Support kontaktieren</summary>
        <ActionForm action={createGuestTicket} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" name="guestName" placeholder="Benutzername" required />
            <select className="input" name="category">
              {TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <input className="input" name="guestContact" placeholder="E-Mail oder Discord für die Antwort" required />
          <input className="input" name="subject" placeholder="Betreff" required />
          <textarea className="input h-auto py-2" name="message" rows={4} placeholder="Was ist passiert?" required />
          <SubmitButton className="btn-secondary w-full">Ticket senden</SubmitButton>
        </ActionForm>
      </details>
    </>
  );
}
