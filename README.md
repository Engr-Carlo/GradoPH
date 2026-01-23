  # GradoPH - OMR Grading System

A hybrid optical mark recognition (OMR) grading system for Philippine schools.

## Architecture

- **Mobile App** (Flutter) - Camera-based bubble sheet scanner
- **Web Dashboard** (Next.js + TypeScript) - Exam management, results, analytics
- **Backend** (Supabase) - Database, storage, authentication

## Features

- 50-question multiple choice exams (A-D)
- Configurable student ID length (6-12 digits)
- Custom bubble sheet templates (PDF/JPG)
- Real-time scanning with >95% confidence
- Answer key locking after first scan
- Unknown student resolution workflow
- Analytics and CSV export

## Tech Stack

### Mobile
- Flutter
- OpenCV (opencv_dart)
- QR Code Scanner
- Supabase Flutter Client
- SQLite (local caching)

### Web
- Next.js 14
- TypeScript
- Tailwind CSS
- Supabase Client
- React Query
- jsPDF (template generation)

### Backend
- Supabase (PostgreSQL + Storage + Auth)
- Free tier: 1GB storage + 2GB bandwidth/month

## Project Structure

```
GradoPH/
├── mobile/          # Flutter Android app
├── web/             # Next.js web dashboard
└── shared/          # Shared types and constants
```

## Getting Started

### Prerequisites
- Flutter SDK (3.16+)
- Node.js (18+)
- Supabase account

### Setup Instructions

Coming soon...

## Development Status

🚧 Currently in development - MVP phase
