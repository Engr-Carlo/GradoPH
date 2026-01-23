/**
 * App Configuration
 * Update PRODUCTION_API_URL after deploying to Vercel
 */

// Set this to your Vercel URL after deployment
export const PRODUCTION_API_URL = 'https://grado-ph.vercel.app'

// Set to true to always use Vercel API (even in development with Expo Go)
// Set to false to use local server when running with npm start
export const ALWAYS_USE_PRODUCTION_API = true

// Automatically uses local IP in development, production URL in release builds
export const isDevelopment = __DEV__
