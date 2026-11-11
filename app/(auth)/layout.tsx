import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getUser } from '@/lib/auth';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getUser()) redirect('/');
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="glow mb-1 text-center text-4xl font-black tracking-tight text-accent">NEON VAULT</h1>
        <p className="mb-8 text-center text-sm text-muted">Social Casino · nur virtuelle Währung</p>
        {children}
        <footer className="mt-8 flex justify-center gap-4 text-xs text-muted">
          <Link href="/agb">AGB</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/impressum">Impressum</Link>
        </footer>
      </div>
    </main>
  );
}
