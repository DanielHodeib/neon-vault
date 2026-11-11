import Link from 'next/link';

import { login } from '@/app/actions/auth';
import { createGuestTicket } from '@/app/actions/support';
import { ActionForm, SubmitButton } from '@/components/ui';
import { TICKET_CATEGORIES } from '@/lib/format';

export default function LoginPage() {
  return (
    <>
      <ActionForm action={login} className="card space-y-4">
        <h2 className="text-lg font-bold">Einloggen</h2>
        <input className="input" name="username" placeholder="Benutzername" autoComplete="username" required />
        <input className="input" name="password" type="password" placeholder="Passwort" autoComplete="current-password" required />
        <SubmitButton className="btn-primary w-full">Einloggen</SubmitButton>
        <p className="text-center text-sm text-muted">
          Neu hier? <Link href="/register" className="text-accent">Konto erstellen</Link>
        </p>
      </ActionForm>

      <details className="card mt-4">
        <summary className="cursor-pointer text-sm text-muted">Probleme beim Login? Support kontaktieren</summary>
        <ActionForm action={createGuestTicket} className="mt-4 space-y-3">
          <input className="input" name="guestName" placeholder="Dein Benutzername" required />
          <input className="input" name="guestContact" placeholder="E-Mail oder Discord für die Antwort" required />
          <select className="input" name="category">
            {TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="input" name="subject" placeholder="Betreff" required />
          <textarea className="input" name="message" rows={4} placeholder="Was ist passiert?" required />
          <SubmitButton className="btn-ghost w-full">Ticket senden</SubmitButton>
        </ActionForm>
      </details>
    </>
  );
}
