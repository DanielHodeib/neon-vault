import type { MetadataRoute } from 'next';

// Lets players add the casino to their home screen; it then opens without browser bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Neon Vault',
    short_name: 'Neon Vault',
    description: 'Social Casino mit Spielgeld für dich und deine Freunde.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0b0d',
    theme_color: '#0a0b0d',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
