import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'NEON-VAULT',
  description: 'High-end social casino simulation powered by Neon-Vault Coins.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
