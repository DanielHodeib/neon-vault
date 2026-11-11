'use client';

import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/components/I18n';

/** Wraps a picture so a click opens it full-screen; without `src` it just renders the children. */
export function ZoomImage({ src, label, className, children }: { src: string | null; label: string; className?: string; children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  if (!src) return <div className={className}>{children}</div>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`cursor-zoom-in ${className ?? ''}`} aria-label={`${label} vergrößern`}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={() => setOpen(false)} role="dialog" aria-label={label}>
          <button className="btn-ghost absolute top-4 right-4 h-10 w-10 px-0 text-white" aria-label={t('Schließen')}>
            <X />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-provided URLs can't go through next/image */}
          <img src={src} alt={label} className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}
