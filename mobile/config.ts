/**
 * App Configuration
 * Update PRODUCTION_API_URL after deploying to Vercel
 */

// Set this to your Vercel URL after deployment
// Example: 'https://grado-ph.vercel.app'
export const PRODUCTION_API_URL = 'https://grado-ph.vercel.app'

// Automatically uses local IP in development, production URL in release builds
export const isDevelopment = __DEV__
