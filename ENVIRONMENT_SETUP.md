# GradoPH Setup Guide - Environment Configuration

## Prerequisites

1. **Supabase Account**: Sign up at https://supabase.com
2. **Node.js**: v18 or higher
3. **Expo CLI**: Install globally with `npm install -g expo-cli`

## Step 1: Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in project details:
   - Name: GradoPH (or your choice)
   - Database Password: (create a strong password)
   - Region: Choose closest to your location
4. Wait for project to be created (~2 minutes)

## Step 2: Get Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** > **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Anon/Public Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (keep secret!)

## Step 3: Run Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the contents of `shared/database-schema.sql`
4. Paste into the editor
5. Click **Run** to execute
6. Verify tables were created in **Database** > **Tables**

## Step 4: Create Storage Bucket

1. In Supabase dashboard, go to **Storage**
2. Click "Create a new bucket"
3. Bucket name: `scan-images`
4. Public bucket: **No** (keep private)
5. Click **Create bucket**
6. Click on the bucket, go to **Policies**
7. Add policies for authenticated users to upload/read

## Step 5: Configure Mobile App

1. Navigate to `mobile/` directory
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and fill in your Supabase credentials:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## Step 6: Configure Web Dashboard

1. Navigate to `web/` directory
2. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
3. Edit `.env.local` and fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

## Step 7: Install Dependencies

### Mobile App
```bash
cd mobile
npm install
```

### Web Dashboard
```bash
cd web
npm install
```

## Step 8: Run the Apps

### Mobile App (Expo)
```bash
cd mobile
npm start
# Scan QR code with Expo Go app (iOS/Android)
```

### Web Dashboard
```bash
cd web
npm run dev
# Open http://localhost:3000
```

## Step 9: Create First User

1. Open web dashboard at http://localhost:3000
2. Click "Sign Up"
3. Enter email and password
4. Check email for confirmation link (if enabled)
5. Sign in with your credentials

## Step 10: Test OMR Scanning

### Generate Template
1. In web dashboard, go to "Exams"
2. Click "Create Exam"
3. Fill in exam details (name, class, date, number of questions)
4. Enter answer key (e.g., A,B,C,D,A,B...)
5. Click "Generate Template"
6. Download both PNG and PDF versions
7. Print the template

### Scan Bubble Sheet
1. Fill in a printed template with pencil/pen
2. Open mobile app
3. Navigate to exam list
4. Tap on exam, click "Scan"
5. First, scan student ID barcode (if available) or enter manually
6. Then capture photo of filled bubble sheet
7. Review and confirm
8. Wait for processing
9. View results (score, confidence, detected answers)

## Troubleshooting

### Issue: "Missing Supabase environment variables"
**Solution**: Make sure you created `.env` (mobile) and `.env.local` (web) files with correct credentials

### Issue: "Storage bucket not found"
**Solution**: Create `scan-images` bucket in Supabase Storage dashboard

### Issue: "Authentication error"
**Solution**: Verify your Supabase anon key is correct and RLS policies are set up

### Issue: "OMR processing returns low confidence"
**Solution**: 
- Ensure good lighting when capturing photo
- Hold camera steady, avoid blur
- Make sure bubble sheet is flat (no wrinkles)
- Fill bubbles completely with dark pencil/pen
- Ensure all 4 corner markers are visible

### Issue: "PDF generation not working"
**Solution**: The `jspdf` library should be installed. Run `npm install` in web directory.

## Production Deployment

### Deploy Web Dashboard to Vercel
1. Push code to GitHub
2. Go to https://vercel.com
3. Import repository
4. Add environment variables in Vercel dashboard
5. Deploy

### Build Mobile App
```bash
cd mobile
eas build --platform android  # or ios
```

## Next Steps

1. Customize template design in `web/lib/generateTemplate.ts`
2. Adjust bubble detection thresholds in `web/lib/omr-processor.ts`
3. Add more exam types and configurations
4. Implement offline support for mobile app
5. Add analytics and reporting features

## Support

For issues or questions:
- Check `README.md` in project root
- Review Supabase documentation: https://supabase.com/docs
- Check Expo documentation: https://docs.expo.dev

---

**Important Security Notes:**
- Never commit `.env` or `.env.local` files to git
- Keep Service Role Key secret (only use server-side)
- Enable RLS (Row Level Security) on all Supabase tables
- Use HTTPS only in production
