# Deploying the OMR Scanner Edge Function

## Quick Deploy Guide

### Prerequisites
- Supabase CLI installed: `npm install -g supabase`
- Logged in to Supabase: `supabase login`
- Project linked: `supabase link --project-ref fmukamfyganrpmvaejaq`

### Deploy Commands

```powershell
# Navigate to your project root
cd "c:\Users\PC\Documents\VS Code\GradoPH"

# Deploy the function
supabase functions deploy scans-process --no-verify-jwt

# Set up storage bucket permissions (if not already done)
# Go to Supabase Dashboard > Storage > scan-images
# Make sure bucket exists and has proper RLS policies
```

### After Deployment

1. **Update the Scanner to Use Real Mode**
   - In `mobile/screens/ScannerScreen.tsx` line ~162
   - Change: `const USE_MOCK = true` → `const USE_MOCK = false`

2. **Test the Scanner**
   - Open mobile app
   - Navigate to an exam
   - Tap "Start Scanning"
   - Scanner will auto-detect paper and process it

### Alternative: Use Web API Route (Simpler Option)

Since deploying Edge Functions can be complex, you can use the Next.js API route instead:

1. The OMR processor is already in `web/lib/omr-processor.ts`
2. We can create an API route in the web app to handle processing
3. Mobile app calls the web API instead of Supabase Edge Function

Would you like me to set up the web API route instead? It's easier and doesn't require Supabase CLI.

## Troubleshooting

### If deployment fails:
```powershell
# Check Supabase CLI is installed
supabase --version

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref fmukamfyganrpmvaejaq
```

### Common Issues:
- **"Not logged in"**: Run `supabase login` and authenticate in browser
- **"Project not linked"**: Run link command with your project ref
- **"Function not found"**: Check the path is correct: `supabase/functions/scans-process/index.ts`
