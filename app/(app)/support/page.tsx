import Link from 'next/link';

import { createTicket } from '@/app/actions/support';
import { ActionForm, Empty, PageHeader, Section, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { TICKET_CATEGORIES, TICKET_STATUS, timeAgo } from '@/lib/format';
import { db } from '@/lib/hub';
import { atLeast } from '@/lib/roles';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Support') };
}

export default async function SupportPage({ searchParams }: PageProps<'/support'>) {
  const t = await getT();
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
      <PageHeader title="Support" subtitle={isStaff ? t('Alle Tickets der Spieler.') : t('Frag uns, wenn etwas nicht stimmt. Wir antworten hier.')} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section
          title={isStaff ? t('Tickets') : t('Deine Tickets')}
          action={
            <div className="flex gap-1">
              {(['active', 'all'] as const).map((f) => (
                <Link key={f} href={`?filter=${f}`} className={filter === f ? 'chip-active h-7' : 'chip h-7 border-transparent'}>
                  {f === 'active' ? t('Offen') : t('Alle')}
                </Link>
              ))}
            </div>
          }
        >
          {tickets.length === 0 && <Empty>{t('Keine Tickets.')}</Empty>}
          <ul className="divide-y divide-line">
            {tickets.map((tk) => (
              <li key={tk.id}>
                <Link href={`/support/${tk.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{tk.subject}</span>
                    <span className="text-xs text-faint">
                      {t(tk.category)} · {tk.user?.username ?? `${t('Gast')} ${tk.guestName}`} · {t(timeAgo(tk.updatedAt))}
                    </span>
                  </span>
                  <StatusPill status={tk.status} label={t(TICKET_STATUS[tk.status])} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('Neues Ticket')} pad>
          <ActionForm action={createTicket} className="space-y-3">
            <select className="input" name="category">
              {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
            <input className="input" name="subject" placeholder={t('Betreff')} required />
            <textarea className="input h-auto py-2" name="message" rows={5} placeholder={t('Beschreibe dein Anliegen')} required />
            <SubmitButton className="btn-primary w-full">{t('Absenden')}</SubmitButton>
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

function StatusPill({ status, label }: { status: string; label: string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${PILL[status]}`}>{label}</span>;
}
