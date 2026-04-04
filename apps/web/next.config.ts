import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@telegram-enhancer/shared'],
  typedRoutes: false,
  serverExternalPackages: ['telegram'],

  // Performance optimizations
  experimental: {
    // Optimize package imports for faster builds and smaller bundles
    optimizePackageImports: ['@telegram-enhancer/shared'],
  },

  // Image optimization settings
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // Compression for faster transfers
  compress: true,

  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Headers for caching and performance
  async headers() {
    return [
      // Cache static assets aggressively
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Ensure API responses are never cached by the browser
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },

  // webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Only apply in production client builds
    if (!dev && !isServer) {
      // Split chunks more aggressively for better caching
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Separate vendor chunks for better caching
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            // Group common code
            common: {
              minChunks: 2,
              chunks: 'all',
              enforce: true,
            },
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
