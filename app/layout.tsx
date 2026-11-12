import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { accentStyle } from '@/lib/format';

import { I18nProvider } from '@/components/I18n';
import { Toaster } from '@/components/Toaster';
import { getUser } from '@/lib/auth';
import { getLang } from '@/lib/i18nServer';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face' });

export const metadata: Metadata = {
  title: { default: 'Neon Vault', template: '%s · Neon Vault' },
  description: 'Social Casino mit Spielgeld – Crash, Slots, Blackjack, Roulette, Poker und mehr mit Freunden.',
  appleWebApp: { capable: true, title: 'Neon Vault', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0a0b0d', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [user, lang] = await Promise.all([getUser(), getLang()]);
  return (
    <html lang={lang} data-theme={user?.theme ?? 'neon'} style={accentStyle(user?.accent)} className={`${inter.variable} ${mono.variable}`}>
      <body>
        <I18nProvider lang={lang}>
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
