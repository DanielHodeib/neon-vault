import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // Hide Next.js on-screen dev indicators for all users.
  devIndicators: false,
  
  // Allow dev origins including LAN IPs and tunnel domains (dev only).
  ...(isDevelopment && {
    allowedDevOrigins: [
      "10.0.7.60",
      "*.local",
      "localhost",
      "127.0.0.1",
      "192.168.0.0/16",
      "10.0.0.0/8",
      "*.ngrok.io",
      "*.loca.lt",
      "*.localhost.run",
      "*.lhr.life",
      "*.life",
      "*.ts.net",
      "daniels-macbook.tail0bc6b8.ts.net",
    ],
  }),
  
  // ====================================================================
  // Rewrites: Proxy backend requests
  // ====================================================================
  // In production, the reverse proxy (Nginx/Cloudflare) handles routing
  // In development, we proxy to localhost:5000 for Socket.IO
  async rewrites() {
    if (!isDevelopment) {
      // Production: No rewrites needed, reverse proxy handles routing
      // Relative URLs are used in frontend (e.g., /api, /socket.io)
      return [];
    }

    // Development: Proxy Socket.IO to local game server
    return [
      // Keep Socket.IO on same origin so one public app tunnel is enough.
      {
        source: '/socket.io',
        destination: 'http://127.0.0.1:5000/socket.io/',
      },
      {
        source: '/socket.io/',
        destination: 'http://127.0.0.1:5000/socket.io/',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:5000/socket.io/:path*',
      },
    ];
  },
  
  // ====================================================================
  // Security Headers
  // ====================================================================
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Permissions-Policy',
          value: 'geolocation=(), microphone=(), camera=()',
        },
        // Allow Cloudflare and internal proxies
        {
          key: 'Access-Control-Allow-Headers',
          value: 'Content-Type, Authorization',
        },
      ],
    },
  ],
  
  // ====================================================================
  // Compression & Performance
  // ====================================================================
  compress: true,
  
  // ====================================================================
  // Production Build Configuration
  // ====================================================================
  productionBrowserSourceMaps: false, // Disable source maps in production for security
  
  // ====================================================================
  // Experimental Features (if needed)
  // ====================================================================
  // experimental: {
  //   isrMemoryCacheSize: 52 * 1024 * 1024, // 52MB ISR cache
  // },
};

export default nextConfig;
