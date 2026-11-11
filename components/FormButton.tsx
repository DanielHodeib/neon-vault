'use client';

import { useTransition, type ReactNode } from 'react';

import type { ActionState } from '@/lib/action';
import { useT } from './I18n';
import { toastAction } from './ui';

/** A button that runs a no-argument server action and toasts its result. */
export function FormButton({
  action,
  children,
  className = 'btn-ghost',
  disabled,
  confirm,
}: {
  action: () => Promise<ActionState | void>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const t = useT();
  return (
    <button
      className={className}
      disabled={disabled || pending}
      onClick={() => {
        if (confirm && !window.confirm(t(confirm))) return;
        start(() => toastAction(action()));
      }}
    >
      {pending ? '…' : typeof children === 'string' ? t(children) : children}
    </button>
  );
}
