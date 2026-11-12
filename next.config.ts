import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  // The click tests (e2e/) run their own dev server next to a normal one; it gets its own build folder.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // Fun sounds/images in the admin area are up to 2 MB (each upload action checks its own limit).
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
        // HTTPS only from now on (production runs behind Caddy with a certificate).
        ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
      ],
    },
  ],
};

export default nextConfig;
