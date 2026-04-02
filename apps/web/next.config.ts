import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@telegram-enhancer/shared'],
  typedRoutes: false,
};

export default nextConfig;
