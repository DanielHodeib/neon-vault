import { db, emitToUser, hub, notify, UserError } from './hub';
import { atLeast } from './roles';

// Ticket reply rules without Next.js: the server action calls this, the tests call it directly.
type Me = { id: string; role: Parameters<typeof atLeast>[0] };

/** Staff dashboards listen on this room and refresh. */
export const pingStaff = () => hub.io?.to('staff').emit('tickets', null);

/** Owner or staff may answer an open ticket; a staff answer marks it ANSWERED, the owner's reopens it. */
export async function replyTicket(me: Me, ticketId: string, content: string) {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  const isStaff = atLeast(me.role, 'SUPPORT');
  if (!ticket || (!isStaff && ticket.userId !== me.id)) throw new UserError('Ticket nicht gefunden.');
  if (ticket.status === 'CLOSED') throw new UserError('Ticket ist geschlossen.');
  const asStaff = isStaff && ticket.userId !== me.id;
  await db.ticket.update({
    where: { id: ticketId },
    data: { status: asStaff ? 'ANSWERED' : 'OPEN', messages: { create: { senderId: me.id, content, isStaff: asStaff } } },
  });
  if (asStaff && ticket.userId) await notify(ticket.userId, 'Support-Antwort', `Neue Antwort auf „${ticket.subject}“.`, { link: `/support/${ticket.id}` });
  else pingStaff();
  if (ticket.userId) emitToUser(ticket.userId, 'tickets', null);
}
