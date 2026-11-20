import type { User } from '@prisma/client';
import { MessageSquareOff, Search, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar, Empty, RoleBadge, Section } from '@/components/ui';
import { coins } from '@/lib/format';
import { db, hub, isMuted } from '@/lib/hub';
import { secondsUntil } from '@/lib/serverInfo';
import { isBanned } from '@/lib/session';

export const KIND_LABEL: Record<string, string> = {
  BET: 'Einsatz', WIN: 'Gewinn', CANCEL: 'Storno', REFUND: 'Cashback', BUYIN: 'Buy-in', CASHOUT: 'Cashout', FAUCET: 'Daily',
  QUEST: 'Quest', TRANSFER: 'Überweisung', RAIN: 'Rain', ADMIN: 'Admin', BONUS: 'Bonus', SHOP: 'Shop',
};

// ---------- building blocks ----------

export function Kpi({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone?: 'win' | 'loss' | 'gold' }) {
  const color = tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : tone === 'gold' ? 'text-gold' : '';
  return (
    <div className="card flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-muted"><Icon size={17} /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className={`num truncate text-lg font-semibold ${color}`}>{value}</p>
        {hint && <p className="truncate text-[11px] text-faint">{hint}</p>}
      </div>
    </div>
  );
}

/** Online count, event, maintenance and countdown at a glance. */
export function StatusPills() {
  const pill = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium';
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`${pill} border-win/30 text-win`}><span className="h-1.5 w-1.5 rounded-full bg-win" /> {hub.online.size} online</span>
      {hub.event && <span className={`${pill} border-accent/40 text-accent`}>⚡ {hub.event.label}</span>}
      {hub.maintenance.on && <span className={`${pill} border-loss/40 text-loss`}>Wartung aktiv</span>}
      {hub.countdown && <span className={`${pill} border-gold/40 text-gold`}>{hub.countdown.kind === 'restart' ? 'Neustart' : 'Wartung'} in {secondsUntil(hub.countdown.at)} s</span>}
    </div>
  );
}

export function PlayerSearch({ tab, q, selectedId, users }: { tab: string; q: string; selectedId?: string; users: User[] }) {
  return (
    <Section title="Spieler" className="min-w-0">
      <form className="flex gap-2 border-b border-line p-3">
        <input type="hidden" name="tab" value={tab} />
        <input className="input" name="q" defaultValue={q} placeholder="Name suchen" autoCapitalize="off" />
        <button className="btn-secondary w-10 px-0" aria-label="Suchen"><Search size={16} /></button>
      </form>
      {users.length === 0 && <Empty>Niemand gefunden.</Empty>}
      <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto text-sm">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin?tab=${tab}&q=${encodeURIComponent(q)}&user=${u.id}`}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 ${u.id === selectedId ? 'bg-raised' : 'hover:bg-raised/50'}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar url={u.avatarUrl} name={u.username} size={26} />
                <span className="truncate">{u.username}</span>
                <RoleBadge role={u.role} />
                {hub.online.has(u.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-win" title="online" />}
                {isBanned(u) && <span className="text-[11px] text-loss">gesperrt</span>}
                {isMuted(u.id) && <MessageSquareOff size={13} className="text-gold" />}
              </span>
              <span className="num shrink-0 text-xs text-faint">{coins(u.balance)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export const findUsers = (q: string) => db.user.findMany({ where: q ? { username: { contains: q } } : {}, orderBy: { createdAt: 'desc' }, take: 50 });

// ---------- tabs ----------

export const isPast = (d: Date) => d.getTime() < Date.now();
