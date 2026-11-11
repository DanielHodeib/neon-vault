import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { LangSwitch } from '@/components/LangSwitch';
import { Logo } from '@/components/ui';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18nServer';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  if (await getUser()) redirect('/');
  return (
    <main className="flex min-h-dvh flex-col px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-sm flex-1">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/login"><Logo /></Link>
          <LangSwitch />
        </div>
        {children}
      </div>
      <footer className="mx-auto mt-10 flex gap-5 text-xs text-faint">
        <Link href="/agb" className="hover:text-muted">{t('AGB')}</Link>
        <Link href="/datenschutz" className="hover:text-muted">{t('Datenschutz')}</Link>
        <Link href="/impressum" className="hover:text-muted">{t('Impressum')}</Link>
      </footer>
    </main>
  );
}
