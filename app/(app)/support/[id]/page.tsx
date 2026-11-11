import type { TicketStatus } from '@prisma/client';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { deleteTicket, replyTicket, setTicketStatus } from '@/app/actions/support';
import { FormButton } from '@/components/FormButton';
import { ActionForm, PageHeader, SubmitButton } from '@/components/ui';
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
    <div className="mx-auto max-w-3xl">
      <Link href="/support" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft size={16} /> Alle Tickets</Link>
      <PageHeader
        title={ticket.subject}
        subtitle={`${ticket.category} · ${STATUS[ticket.status]} · ${ticket.user?.username ?? `Gast ${ticket.guestName} (${ticket.guestContact})`}`}
      />
      {isStaff && (
        <div className="-mt-2 mb-5 flex flex-wrap gap-2">
          {(['IN_PROGRESS', 'CLOSED', 'OPEN'] as TicketStatus[]).filter((s) => s !== ticket.status).map((s) => (
            <FormButton key={s} action={setTicketStatus.bind(null, ticket.id, s)} className="btn-secondary h-8 text-xs">{STATUS[s]}</FormButton>
          ))}
          <FormButton action={deleteTicket.bind(null, ticket.id)} className="btn-danger h-8 text-xs" confirm="Ticket endgültig löschen?">Löschen</FormButton>
        </div>
      )}

      <div className="space-y-3">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`max-w-[88%] rounded-xl border px-4 py-3 ${m.isStaff ? 'ml-auto border-accent/30 bg-accent/5' : 'border-line bg-surface'}`}>
            <p className="mb-1 text-xs text-faint">
              <span className="font-medium text-muted">{m.isStaff ? 'Support' : (m.sender?.username ?? ticket.guestName)}</span> · {m.createdAt.toLocaleString('de-DE')}
            </p>
            <p className="text-sm whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>

      {ticket.status !== 'CLOSED' ? (
        <ActionForm action={replyTicket} className="mt-5 space-y-3">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <textarea className="input h-auto py-2" name="content" rows={3} placeholder="Antwort schreiben …" required />
          <div className="flex justify-end"><SubmitButton>Antworten</SubmitButton></div>
        </ActionForm>
      ) : (
        <p className="mt-5 text-center text-sm text-faint">Dieses Ticket ist geschlossen.</p>
      )}
    </div>
  );
}
