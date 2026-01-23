# GradoPH Mobile Scanner

React Native mobile app for scanning bubble sheets.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Add your Supabase credentials to `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Development

Start the Expo development server:
```bash
npm start
```

Run on Android:
```bash
npm run android
```

## Features

- [x] Teacher authentication
- [x] List exams from Supabase
- [x] View exam details
- [x] Camera-based barcode/QR scanning
- [ ] Bubble detection and processing
- [ ] Submit scanned results to Supabase
- [ ] Offline support with local caching

## Tech Stack

- Expo ~54
- React Native 0.81
- TypeScript
- Supabase Client
- React Navigation
- Expo Camera
