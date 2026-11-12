'use client';

import type { Role } from '@prisma/client';
import Link from 'next/link';
import { VaultMark } from './VaultMark';
import { useActionState, useEffect, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import toast from 'react-hot-toast';

import type { ActionState } from '@/lib/action';
import { coins } from '@/lib/format';
import { ROLE_STYLE } from '@/lib/roles';
import { tPage } from '@/lib/i18n';
import { useT } from './I18n';
import { shopItem } from '@/lib/shop';

/** Vault-door mark in the accent colour; the handle turns on hover, the neon flickers on once on load. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo group flex items-center gap-2.5">
      <span className="logo-mark shrink-0">
        <VaultMark size={34} color="var(--color-accent)" bg="var(--bg)" wheelClass="logo-wheel" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="logo-neon text-[15px] font-black tracking-[.22em] text-accent">NEON</span>
          <span className="mt-0.5 text-[10.5px] font-semibold tracking-[.48em] text-fg/90">VAULT</span>
        </span>
      )}
    </span>
  );
}

// Plain-string titles, labels and button texts passed to these blocks are translated here,
// so server pages can hand over German text and still show English.
const tr = (t: (s: string) => string, node: ReactNode) => (typeof node === 'string' ? t(node) : node);

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const t = useT();
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t(title)}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{t(subtitle)}</p>}
      </div>
      {action}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const t = useT();
  return <p className="py-6 text-center text-sm text-faint">{tr(t, children)}</p>;
}

export function SubmitButton({ children, className = 'btn-primary' }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button className={className} disabled={pending}>
      {pending ? t('Bitte warten …') : tr(t, children)}
    </button>
  );
}

/** A <form> bound to a server action that toasts the result. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.error) toast.error(tPage(state.error));
    if (state?.success) toast.success(tPage(state.success));
  }, [state]);
  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  );
}

/** Calls a server action that returns ActionState and toasts it. */
export async function toastAction(promise: Promise<ActionState | void>) {
  const state = await promise;
  if (state?.error) toast.error(tPage(state.error));
  if (state?.success) toast.success(tPage(state.success));
}

export function RoleBadge({ role }: { role: Role | string | undefined }) {
  if (!role || role === 'USER') return null;
  return <span className={`rounded border px-1.5 py-px text-[10px] font-semibold tracking-wide ${ROLE_STYLE[role as Role]}`}>{role}</span>;
}

export function RankTag({ rank }: { rank?: { tag: string; color: string } }) {
  if (!rank) return null;
  return (
    <span className="rounded px-1.5 py-px text-[10px] font-semibold tracking-wide" style={{ color: rank.color, background: `${rank.color}1f` }}>
      {rank.tag.replace(/_/g, ' ')}
    </span>
  );
}

export function UserLink({ name }: { name: string }) {
  return (
    <Link href={`/profile/${name}`} className="font-medium hover:text-accent">
      {name}
    </Link>
  );
}

export function Avatar({ url, name, size = 36, frame }: { url?: string | null; name: string; size?: number; frame?: string | null }) {
  const item = shopItem(frame);
  // A bought frame wraps the picture in a gradient ring (animated ones spin it behind the picture).
  if (item?.frame) {
    return (
      <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full p-[2px] ${item.className ?? ''}`} style={{ background: item.frame, width: size + 4, height: size + 4 }}>
        <span className="relative">
          <Avatar url={url} name={name} size={size - 2} />
        </span>
      </span>
    );
  }
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URLs, not optimizable
    <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-raised font-semibold text-muted ring-1 ring-line" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name[0]?.toUpperCase()}
    </span>
  );
}

export const Coins = ({ value }: { value: number }) => <span className="num font-medium text-gold">{coins(value)}</span>;

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="card">
      <p className="eyebrow">{t(label)}</p>
      <div className="mt-1.5 text-lg font-semibold sm:text-xl">{children}</div>
    </div>
  );
}

/** Bet amount input with ½ / 2× / max shortcuts. */
export function BetInput({ value, onChange, balance, min = 1 }: { value: number; onChange: (v: number) => void; balance: number; min?: number }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(Math.floor(v), balance)));
  const t = useT();
  return (
    <div>
      <label className="label">{t('Einsatz')}{min > 1 && ` · min. ${coins(min)}`}</label>
      <div className="flex rounded-lg border border-line bg-bg focus-within:border-accent">
        <input
          className="num h-10 w-full min-w-0 bg-transparent px-3 text-sm outline-none"
          type="number"
          inputMode="numeric"
          min={min}
          value={value || ''}
          onChange={(e) => onChange(Math.floor(Number(e.target.value)) || 0)}
        />
        {[['½', value / 2], ['2×', value * 2], ['Max', balance]].map(([label, v]) => (
          <button key={label} type="button" className="border-l border-line px-3 text-xs font-medium text-muted hover:text-fg" onClick={() => set(Number(v))}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Panel with a titled header row; children render edge-to-edge (use `pad` for padded content). */
export function Section({ title, action, pad, className = '', children }: { title: ReactNode; action?: ReactNode; pad?: boolean; className?: string; children: ReactNode }) {
  const t = useT();
  return (
    <section className={`panel ${className}`}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">{tr(t, title)}</h2>
        {action}
      </div>
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
