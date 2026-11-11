import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/Toaster';
import { getUser } from '@/lib/auth';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face' });

export const metadata: Metadata = {
  title: { default: 'Neon Vault', template: '%s · Neon Vault' },
  description: 'Social Casino mit Spielgeld – Crash, Slots, Blackjack, Roulette, Poker und Coinflip mit Freunden.',
};

export const viewport: Viewport = { themeColor: '#0a0b0d', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  return (
    <html lang="de" data-theme={user?.theme ?? 'neon'} className={`${inter.variable} ${mono.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
