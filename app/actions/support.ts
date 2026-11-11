'use server';

import type { TicketStatus } from '@prisma/client';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { parse, rateLimit, run, type ActionState } from '@/lib/action';
import { requireRole, requireUser } from '@/lib/auth';
import { db, emitToUser, hub, notify, UserError } from '@/lib/hub';
import { TICKET_CATEGORIES as CATEGORIES } from '@/lib/format';
import { atLeast } from '@/lib/roles';

const ticketSchema = z.object({
  subject: z.string().trim().min(3, 'Betreff zu kurz.').max(120),
  category: z.string().refine((c) => CATEGORIES.includes(c), 'Ungültige Kategorie.'),
  message: z.string().trim().min(5, 'Nachricht zu kurz.').max(2000),
});

/** Staff dashboards listen on this room and refresh. */
const pingStaff = () => hub.io?.to('staff').emit('tickets', null);

export async function createTicket(_: ActionState, form: FormData) {
  let ticketId = '';
  const result = await run(async () => {
    const user = await requireUser();
    const { subject, category, message } = parse(ticketSchema, form);
    const ticket = await db.ticket.create({
      data: { userId: user.id, subject, category, messages: { create: { senderId: user.id, content: message } } },
    });
    ticketId = ticket.id;
    pingStaff();
  });
  if (result?.error) return result;
  redirect(`/support/${ticketId}`);
}

export async function createGuestTicket(_: ActionState, form: FormData) {
  return run(async () => {
    await rateLimit('guest-ticket', 3, 60 * 60_000);
    const data = parse(
      ticketSchema.extend({ guestName: z.string().trim().min(1, 'Name fehlt.').max(40), guestContact: z.string().trim().min(3, 'Kontakt fehlt.').max(120) }),
      form,
    );
    await db.ticket.create({
      data: {
        guestName: data.guestName,
        guestContact: data.guestContact,
        subject: data.subject,
        category: data.category,
        messages: { create: { content: data.message } },
      },
    });
    pingStaff();
    return 'Ticket gesendet. Wir melden uns über deinen Kontakt.';
  });
}

export async function replyTicket(_: ActionState, form: FormData) {
  return run(async () => {
    const user = await requireUser();
    const { ticketId, content } = parse(z.object({ ticketId: z.string(), content: z.string().trim().min(1).max(2000) }), form);
    const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
    const isStaff = atLeast(user.role, 'SUPPORT');
    if (!ticket || (!isStaff && ticket.userId !== user.id)) throw new UserError('Ticket nicht gefunden.');
    if (ticket.status === 'CLOSED') throw new UserError('Ticket ist geschlossen.');
    const asStaff = isStaff && ticket.userId !== user.id;
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: asStaff ? 'ANSWERED' : 'OPEN', messages: { create: { senderId: user.id, content, isStaff: asStaff } } },
    });
    if (asStaff && ticket.userId) await notify(ticket.userId, 'Support-Antwort', `Neue Antwort auf „${ticket.subject}“.`);
    else pingStaff();
    if (ticket.userId) emitToUser(ticket.userId, 'tickets', null);
    refresh();
    return 'Gesendet.';
  });
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  await requireRole('SUPPORT');
  const ticket = await db.ticket.update({ where: { id: ticketId }, data: { status } });
  if (ticket.userId) emitToUser(ticket.userId, 'tickets', null);
  refresh();
}

export async function deleteTicket(ticketId: string) {
  await requireRole('SUPPORT');
  await db.ticket.delete({ where: { id: ticketId } });
  redirect('/support');
}
