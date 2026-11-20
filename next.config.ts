import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
// Content-Security-Policy: nothing but our own origin may run scripts or connect. Next's inline bootstrap scripts need
// 'unsafe-inline' (a nonce setup would make every page dynamic). img-src lists the two hosts of the few old external
// avatar/banner URLs still in the DB; new ones can't be set any more, so drop the hosts once those are re-uploaded.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://encrypted-tbn0.gstatic.com https://imgs.search.brave.com",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws://localhost:* http://localhost:*' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
        { key: 'Content-Security-Policy', value: csp },
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
