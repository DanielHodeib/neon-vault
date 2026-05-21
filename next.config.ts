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
  async rewrites() {
    if (!isDevelopment) {
      return [];
    }

    return [
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
  output: 'standalone', // 👈 DIESE ZEILE ERZEUGT DEN ULTRA-SCHLENKEN DOCKER-OUTPUT!
  productionBrowserSourceMaps: false, 
};

export default nextConfig;