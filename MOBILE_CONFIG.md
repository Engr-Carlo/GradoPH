# Mobile App Configuration

## Using with Production (Vercel)

After deploying to Vercel, update `mobile/config.ts`:

```typescript
export const PRODUCTION_API_URL = 'https://your-actual-vercel-url.vercel.app'
```

Then you can test with Expo Go using the production API!

## Development vs Production

- **Development** (`npm start`): Uses local IP auto-detection → `http://192.168.x.x:3000`
- **Production** (built APK): Uses Vercel URL → `https://your-app.vercel.app`

## Quick Switch for Testing

Want to test with production API while developing?

In `mobile/config.ts`, change:
```typescript
export const isDevelopment = false  // Force production mode
```

Then restart `npm start`.
