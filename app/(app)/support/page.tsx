import Link from 'next/link';

import { createTicket } from '@/app/actions/support';
import { ActionForm, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { TICKET_CATEGORIES, TICKET_STATUS as STATUS, timeAgo } from '@/lib/format';
import { db } from '@/lib/hub';
import { atLeast } from '@/lib/roles';

export default async function SupportPage({ searchParams }: PageProps<'/support'>) {
  const user = await requireUser();
  const isStaff = atLeast(user.role, 'SUPPORT');
  const { filter = 'active' } = (await searchParams) as { filter?: string };
  const tickets = await db.ticket.findMany({
    where: {
      ...(isStaff ? {} : { userId: user.id }),
      ...(filter === 'active' ? { status: { not: 'CLOSED' } } : {}),
    },
    include: { user: { select: { username: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_360px]">
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{isStaff ? 'Alle Tickets' : 'Deine Tickets'}</h2>
          <div className="flex gap-2 text-sm">
            <Link href="?filter=active" className={filter === 'active' ? 'text-accent' : 'text-muted'}>Aktiv</Link>
            <Link href="?filter=all" className={filter === 'all' ? 'text-accent' : 'text-muted'}>Alle</Link>
          </div>
        </div>
        {tickets.length === 0 && <p className="text-sm text-muted">Keine Tickets.</p>}
        <ul className="divide-y divide-line">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/support/${t.id}`} className="flex items-center justify-between gap-2 py-3 hover:text-accent">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{t.subject}</span>
                  <span className="text-xs text-muted">
                    {t.category} · {t.user?.username ?? `Gast: ${t.guestName}`} · {timeAgo(t.updatedAt)}
                  </span>
                </span>
                <span className="shrink-0 text-xs">{STATUS[t.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <ActionForm action={createTicket} className="card h-fit space-y-3">
        <h2 className="font-bold">Neues Ticket</h2>
        <select className="input" name="category">
          {TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="input" name="subject" placeholder="Betreff" required />
        <textarea className="input" name="message" rows={5} placeholder="Beschreibe dein Anliegen" required />
        <SubmitButton>Senden</SubmitButton>
      </ActionForm>
    </div>
  );
}
