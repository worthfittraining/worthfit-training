import type { NextConfig } from 'next'
// @ts-expect-error next-pwa has no types
import withPWA from 'next-pwa'

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // only active in production
  buildExcludes: [/middleware-manifest\.json$/],
  publicExcludes: ['!icons/**/*'],
})

const nextConfig: NextConfig = {
  // your other config here
}

export default pwaConfig(nextConfig)
