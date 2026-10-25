import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@festpass/shared'],
  poweredByHeader: false,
};

export default nextConfig;
