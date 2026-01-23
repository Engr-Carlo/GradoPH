/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['your-supabase-project.supabase.co'],
  },
  // Speed up compilation and reduce memory usage
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Faster builds
  experimental: {
    optimizePackageImports: ['qrcode'],
    serverComponentsExternalPackages: ['sharp'],
    // Skip tracing Sharp to avoid stack overflow
    outputFileTracingExcludes: {
      '*': [
        'node_modules/sharp/**/*',
        'node_modules/@img/**/*',
      ],
    },
  },
  // Reduce initial load time
  modularizeImports: {
    'react-icons': {
      transform: 'react-icons/{{member}}',
    },
  },
  // Webpack config to handle Sharp (native module)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize Sharp to avoid bundling issues
      config.externals = [...config.externals, 'sharp']
    }
    return config
  },
}

module.exports = nextConfig
