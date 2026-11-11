import Link from 'next/link';

import { createTicket } from '@/app/actions/support';
import { ActionForm, Empty, PageHeader, Section, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { TICKET_CATEGORIES, TICKET_STATUS, timeAgo } from '@/lib/format';
import { db } from '@/lib/hub';
import { atLeast } from '@/lib/roles';

export const metadata = { title: 'Support' };

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
    <>
      <PageHeader title="Support" subtitle={isStaff ? 'Alle Tickets der Spieler.' : 'Frag uns, wenn etwas nicht stimmt. Wir antworten hier.'} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section
          title={isStaff ? 'Tickets' : 'Deine Tickets'}
          action={
            <div className="flex gap-1">
              {(['active', 'all'] as const).map((f) => (
                <Link key={f} href={`?filter=${f}`} className={filter === f ? 'chip-active h-7' : 'chip h-7 border-transparent'}>
                  {f === 'active' ? 'Offen' : 'Alle'}
                </Link>
              ))}
            </div>
          }
        >
          {tickets.length === 0 && <Empty>Keine Tickets.</Empty>}
          <ul className="divide-y divide-line">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.subject}</span>
                    <span className="text-xs text-faint">
                      {t.category} · {t.user?.username ?? `Gast ${t.guestName}`} · {timeAgo(t.updatedAt)}
                    </span>
                  </span>
                  <StatusPill status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Neues Ticket" pad>
          <ActionForm action={createTicket} className="space-y-3">
            <select className="input" name="category">
              {TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="input" name="subject" placeholder="Betreff" required />
            <textarea className="input h-auto py-2" name="message" rows={5} placeholder="Beschreibe dein Anliegen" required />
            <SubmitButton className="btn-primary w-full">Absenden</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

const PILL: Record<string, string> = {
  OPEN: 'border-gold/40 text-gold',
  IN_PROGRESS: 'border-sky-400/40 text-sky-300',
  ANSWERED: 'border-win/40 text-win',
  CLOSED: 'border-line text-faint',
};

function StatusPill({ status }: { status: string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${PILL[status]}`}>{TICKET_STATUS[status]}</span>;
}
