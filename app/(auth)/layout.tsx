import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Logo } from '@/components/ui';
import { getUser } from '@/lib/auth';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getUser()) redirect('/');
  return (
    <main className="flex min-h-dvh flex-col px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-sm flex-1">
        <Link href="/login" className="mb-10 inline-block"><Logo /></Link>
        {children}
      </div>
      <footer className="mx-auto mt-10 flex gap-5 text-xs text-faint">
        <Link href="/agb" className="hover:text-muted">AGB</Link>
        <Link href="/datenschutz" className="hover:text-muted">Datenschutz</Link>
        <Link href="/impressum" className="hover:text-muted">Impressum</Link>
      </footer>
    </main>
  );
}
