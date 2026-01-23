# GradoPH Setup Guide

## Current Progress ✅

### Completed:
1. ✅ Monorepo structure created (`/mobile`, `/web`, `/shared`)
2. ✅ Shared TypeScript types and constants defined
3. ✅ Next.js web dashboard initialized with:
   - TypeScript + Tailwind CSS
   - Supabase client configuration
   - Authentication pages (login/signup)
   - React Query for data fetching
4. ✅ Database schema designed (SQL file ready)
5. ✅ Project documentation and .gitignore

### Next Steps:

## 1. Setup Supabase (REQUIRED FIRST)

### A. Create Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization and project name: "GradoPH"
4. Set a strong database password
5. Select Singapore region (closest to PH)
6. Wait for project to initialize (~2 minutes)

### B. Configure Database
1. In Supabase Dashboard, go to **SQL Editor**
2. Copy contents from `shared/database-schema.sql`
3. Paste and click "Run"
4. Verify tables created in **Table Editor**

### C. Setup Storage
1. Go to **Storage** in Supabase Dashboard
2. Click "Create new bucket"
3. Name: `scan-images`
4. Set to **Public** bucket
5. Click "Save"

### D. Get API Keys
1. Go to **Settings** → **API**
2. Copy:
   - `Project URL`
   - `anon/public` key
   - `service_role` key (keep secret!)

### E. Configure Web App
1. In `web/` folder, create `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

## 2. Install Web Dependencies

```powershell
cd web
npm install
```

## 3. Run Web Dashboard

```powershell
cd web
npm run dev
```

Visit: http://localhost:3000

## 4. Setup Flutter Mobile App

### A. Install Flutter
1. Download Flutter SDK: https://docs.flutter.dev/get-started/install/windows
2. Extract to `C:\src\flutter`
3. Add to PATH: `C:\src\flutter\bin`
4. Run: `flutter doctor` to verify installation

### B. Install Android Studio
1. Download: https://developer.android.com/studio
2. Install Android SDK
3. Setup Android emulator or connect physical device

### C. Create Flutter Project
```powershell
cd mobile
flutter create .
```

### D. Add Dependencies
Edit `mobile/pubspec.yaml`:
```yaml
dependencies:
  flutter:
    sdk: flutter
  camera: ^0.10.5
  opencv_dart: ^1.0.4
  qr_code_scanner: ^1.0.1
  supabase_flutter: ^2.0.0
  sqflite: ^2.3.0
  shared_preferences: ^2.2.2
  image: ^4.1.3
  http: ^1.1.0
```

Then run:
```powershell
flutter pub get
```

## 5. Configure Supabase in Flutter

Create `mobile/lib/config/supabase.dart`:
```dart
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  static const String supabaseUrl = 'https://your-project.supabase.co';
  static const String supabaseAnonKey = 'your-anon-key-here';
  
  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
  }
}

final supabase = Supabase.instance.client;
```

## 6. What's Built So Far

### Web Dashboard (`/web`)
- ✅ Home page with navigation
- ✅ Login page (email/password)
- ✅ Signup page (creates teacher + school)
- ✅ Supabase authentication integration
- ❌ Dashboard (TODO)
- ❌ Exam creation (TODO)
- ❌ Student management (TODO)
- ❌ Results viewing (TODO)
- ❌ Template generator (TODO)

### Mobile App (`/mobile`)
- ❌ Camera scanner (TODO)
- ❌ OMR processing (TODO)
- ❌ Preview screen (TODO)
- ❌ Authentication (TODO)

### Database
- ✅ Schema designed
- ✅ Tables: schools, teachers, classes, students, exams, scans
- ✅ Triggers for answer key locking and auto-grading
- ✅ Row Level Security (RLS) policies

## 7. Development Workflow

### Test Web App:
1. Start Next.js: `cd web && npm run dev`
2. Open http://localhost:3000
3. Sign up with test account
4. Verify Supabase tables populated

### Build Flutter App:
1. Connect Android device or start emulator
2. `cd mobile && flutter run`
3. APK for testing: `flutter build apk --debug`

## 8. Key Files to Review

- `shared/types.ts` - All TypeScript interfaces
- `shared/constants.ts` - Configuration constants
- `shared/database-schema.sql` - Complete DB schema
- `web/app/login/page.tsx` - Login implementation
- `web/app/signup/page.tsx` - Signup with school creation
- `web/lib/supabase.ts` - Supabase client

## 9. Next Implementation Priorities

1. **Dashboard Layout** - Create protected dashboard with navigation
2. **Template Generator** - PDF/JPG bubble sheet creator
3. **Class Management** - Create classes and import students
4. **Exam Creation** - Create exam + answer key + download template
5. **Flutter Camera** - Basic camera capture with QR detection
6. **OMR Processing** - Image processing pipeline
7. **Results Viewing** - Table with scans and scores
8. **Analytics** - Charts and statistics

## 10. Useful Commands

```powershell
# Web development
cd web
npm install                  # Install dependencies
npm run dev                  # Start dev server
npm run build                # Production build
npm run lint                 # Check code quality

# Flutter development
cd mobile
flutter doctor               # Check setup
flutter pub get              # Install dependencies
flutter run                  # Run on device/emulator
flutter build apk --debug    # Build test APK
flutter build apk --release  # Build production APK (needs signing)

# Supabase (if using CLI)
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db pull         # Pull schema changes
npx supabase db push         # Push schema changes
```

## 11. Testing Checklist

- [ ] Create Supabase project
- [ ] Run database schema SQL
- [ ] Create storage bucket
- [ ] Configure .env.local
- [ ] Install web dependencies
- [ ] Test signup flow
- [ ] Test login flow
- [ ] Verify data in Supabase tables
- [ ] Install Flutter
- [ ] Create Flutter project
- [ ] Test on Android device/emulator

## 12. Troubleshooting

**Supabase connection errors:**
- Check .env.local has correct URL and keys
- Ensure bucket `scan-images` exists
- Verify RLS policies enabled

**Flutter build errors:**
- Run `flutter clean`
- Delete `pubspec.lock` and run `flutter pub get`
- Update Flutter: `flutter upgrade`

**CORS errors in web:**
- Add your localhost to Supabase allowed origins
- Settings → API → CORS Configuration

## Need Help?

Check the official docs:
- Next.js: https://nextjs.org/docs
- Supabase: https://supabase.com/docs
- Flutter: https://docs.flutter.dev
- OpenCV Dart: https://pub.dev/packages/opencv_dart
