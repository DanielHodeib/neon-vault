import type { User } from '@prisma/client';
import { announceAction, clearChatAction } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { cancelMarket } from '@/app/actions/markets';
import { EventForm } from './EventForm';
import { ActionForm, Empty, Section, SubmitButton } from '@/components/ui';
import { db, hub } from '@/lib/hub';
import { atLeast } from '@/lib/roles';
import { isPast } from './shared';

export async function LiveTab({ actor }: { actor: User }) {
  const isAdmin = atLeast(actor.role, 'ADMIN');
  const markets = await db.market.findMany({
    where: { status: 'open' },
    orderBy: { closesAt: 'asc' },
    take: 20,
    select: { id: true, question: true, closesAt: true, creator: { select: { username: true } }, _count: { select: { bets: true } } },
  });
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section title="Ankündigung" pad>
        <ActionForm action={announceAction} className="space-y-3">
          <textarea className="input h-auto py-2" name="message" rows={3} maxLength={300} placeholder="Nachricht an alle – erscheint als Einblendung" required />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="persist" className="h-4 w-4 accent-[var(--accent)]" /> Auch als Benachrichtigung speichern
          </label>
          <SubmitButton className="btn-primary">Senden</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Chat" pad>
        <p className="mb-3 text-sm text-muted">{hub.chat.length} Nachrichten im Verlauf. Einzelne Spieler schaltest du im Tab „Spieler“ stumm.</p>
        <FormButton action={clearChatAction} confirm="Den Chat für alle leeren?" className="btn-secondary">Chat leeren</FormButton>
      </Section>

      {isAdmin && (
        <>
          <Section title="Globales Event" pad className="lg:col-span-2">
            <EventForm
              running={hub.event && { label: hub.event.label, description: hub.event.description, endsAt: hub.event.endsAt }}
              auto={{ on: hub.autoEvents, nextAt: hub.nextAutoAt }}
            />
          </Section>
        </>
      )}

      <Section title={`Offene Wetten · ${markets.length}`} className="lg:col-span-2">
        {markets.length === 0 ? (
          <Empty>Keine offenen Wetten.</Empty>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {markets.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.question}</span>
                  <span className="text-xs text-muted">
                    von {m.creator.username} · {m._count.bets} Einsätze · {isPast(m.closesAt) ? <span className="text-gold">Einsatzschluss vorbei – wartet aufs Auflösen</span> : `bis ${m.closesAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}
                  </span>
                </span>
                <FormButton action={cancelMarket.bind(null, m.id)} confirm={`„${m.question}“ absagen? Alle bekommen ihren Einsatz zurück.`} className="btn-ghost h-8 text-xs">
                  Absagen
                </FormButton>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
