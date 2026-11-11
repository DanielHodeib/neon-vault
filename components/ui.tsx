'use client';

import type { Role } from '@prisma/client';
import Link from 'next/link';
import { useActionState, useEffect, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import toast from 'react-hot-toast';

import type { ActionState } from '@/lib/action';
import { coins } from '@/lib/format';
import { ROLE_STYLE } from '@/lib/roles';

export function SubmitButton({ children, className = 'btn-primary' }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? '…' : children}
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
    if (state?.error) toast.error(state.error);
    if (state?.success) toast.success(state.success);
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
  if (state?.error) toast.error(state.error);
  if (state?.success) toast.success(state.success);
}

export function RoleBadge({ role }: { role: Role | string | undefined }) {
  if (!role || role === 'USER') return null;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${ROLE_STYLE[role as Role]}`}>{role}</span>;
}

export function RankTag({ rank }: { rank?: { tag: string; color: string } }) {
  if (!rank) return null;
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: rank.color, background: `${rank.color}22` }}>
      {rank.tag.replace(/_/g, ' ')}
    </span>
  );
}

export function UserLink({ name }: { name: string }) {
  return (
    <Link href={`/profile/${name}`} className="font-semibold hover:text-accent">
      {name}
    </Link>
  );
}

export function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URLs, not optimizable
    <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid place-items-center rounded-full bg-accent/20 font-bold text-accent" style={{ width: size, height: size }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

export const Coins = ({ value }: { value: number }) => (
  <span className="font-mono font-semibold text-amber-300">{coins(value)} NVC</span>
);

/** Bet amount input with ½ / 2× / max shortcuts. */
export function BetInput({ value, onChange, balance, min = 1 }: { value: number; onChange: (v: number) => void; balance: number; min?: number }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(Math.floor(v), balance)));
  return (
    <div>
      <label className="label">Einsatz (min. {coins(min)})</label>
      <div className="flex gap-1">
        <input className="input font-mono" type="number" min={min} value={value} onChange={(e) => onChange(Math.floor(Number(e.target.value)) || 0)} />
        <button type="button" className="btn-ghost px-2" onClick={() => set(value / 2)}>½</button>
        <button type="button" className="btn-ghost px-2" onClick={() => set(value * 2)}>2×</button>
        <button type="button" className="btn-ghost px-2" onClick={() => set(balance)}>Max</button>
      </div>
    </div>
  );
}
