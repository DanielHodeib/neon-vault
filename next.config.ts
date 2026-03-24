import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.0.3.140", "*.local", "localhost", "127.0.0.1"],
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
