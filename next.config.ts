import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow all dev origins including LAN IPs and tunnel domains.
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
  async rewrites() {
    return [
      // Keep Socket.IO on same origin so one public app tunnel is enough.
      {
        source: '/socket.io',
        destination: 'http://127.0.0.1:4001/socket.io/',
      },
      {
        source: '/socket.io/',
        destination: 'http://127.0.0.1:4001/socket.io/',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:4001/socket.io/:path*',
      },
    ];
  },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Permissions-Policy',
          value: 'geolocation=(), microphone=(), camera=()',
        },
      ],
    },
  ],
};

export default nextConfig;
