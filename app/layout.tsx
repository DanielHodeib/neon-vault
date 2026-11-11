import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/Toaster';
import { getUser } from '@/lib/auth';

import './globals.css';

export const metadata: Metadata = {
  title: 'Neon Vault',
  description: 'Social Casino mit virtueller Währung – Crash, Slots, Blackjack, Roulette, Poker und Coinflip.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  return (
    <html lang="de" data-theme={user?.theme ?? 'neon'}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
