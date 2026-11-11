import type { TicketStatus } from '@prisma/client';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { deleteTicket, replyTicket, setTicketStatus } from '@/app/actions/support';
import { FormButton } from '@/components/FormButton';
import { ActionForm, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { TICKET_STATUS as STATUS } from '@/lib/format';
import { db } from '@/lib/hub';
import { atLeast } from '@/lib/roles';

export default async function TicketPage({ params }: PageProps<'/support/[id]'>) {
  const user = await requireUser();
  const isStaff = atLeast(user.role, 'SUPPORT');
  const ticket = await db.ticket.findUnique({
    where: { id: (await params).id },
    include: { user: { select: { username: true } }, messages: { include: { sender: { select: { username: true } } }, orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket || (!isStaff && ticket.userId !== user.id)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/support" className="text-sm text-accent">← Alle Tickets</Link>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <p className="text-sm text-muted">
              {ticket.category} · {STATUS[ticket.status]} · von {ticket.user?.username ?? `Gast ${ticket.guestName} (${ticket.guestContact})`}
            </p>
          </div>
          {isStaff && (
            <div className="flex flex-wrap gap-2">
              {(['IN_PROGRESS', 'CLOSED', 'OPEN'] as TicketStatus[]).filter((s) => s !== ticket.status).map((s) => (
                <FormButton key={s} action={setTicketStatus.bind(null, ticket.id, s)}>{STATUS[s]}</FormButton>
              ))}
              <FormButton action={deleteTicket.bind(null, ticket.id)} className="btn-danger" confirm="Ticket endgültig löschen?">Löschen</FormButton>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`card max-w-[85%] ${m.isStaff ? 'ml-auto border-accent/40 bg-accent/5' : ''}`}>
            <p className="mb-1 text-xs text-muted">
              {m.isStaff ? '🛡️ Support' : m.sender?.username ?? ticket.guestName} · {m.createdAt.toLocaleString('de-DE')}
            </p>
            <p className="whitespace-pre-wrap text-sm">{m.content}</p>
          </div>
        ))}
      </div>

      {ticket.status !== 'CLOSED' && (
        <ActionForm action={replyTicket} className="card space-y-3">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <textarea className="input" name="content" rows={3} placeholder="Antwort schreiben …" required />
          <SubmitButton>Antworten</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
