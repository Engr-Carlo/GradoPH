# OMR Scanner - Real Processing Setup ✅

## Current Status: READY TO USE

### ✅ What's Working Now:

1. **Auto-Capture Scanner** - Automatically detects paper and captures
2. **Real Processing** - Uses Next.js web API (no Edge Function needed)
3. **Responsive Guides** - Corner markers adjust to template size
4. **Mock Data Processing** - API returns realistic test data

### 🚀 How to Use:

#### 1. Make Sure Servers Are Running

**Terminal 1 - Web Server:**
```powershell
cd web
npm run dev
# Should be running on http://localhost:3001
```

**Terminal 2 - Mobile App:**
```powershell
cd mobile
npm start
# Press 'a' for Android or 'i' for iOS
```

#### 2. Test the Scanner

1. Open mobile app
2. Login
3. Navigate to an exam
4. Tap "Start Scanning"
5. **Auto-capture mode is ON by default**:
   - Point camera at exam template
   - Align corners with green guides
   - Scanner automatically detects paper every 2.5 seconds
   - When detected → Auto-captures → Processes → Shows score

6. **Toggle to Manual mode** if needed:
   - Tap "👆 Manual" button
   - Align template
   - Tap capture button when ready

### 📊 Current Processing:

The scanner now calls: `http://localhost:3001/api/scans/process`

This API route (in `web/app/api/scans/process/route.ts`):
- ✅ Downloads image from Supabase Storage
- ✅ Gets exam details
- ⚠️ Uses mock OMR processing (returns realistic test data)
- ✅ Saves scan to database
- ✅ Returns score and confidence

### 🔧 To Enable Real OMR Processing:

The API route currently returns mock data because OpenCV.js isn't implemented server-side yet. You have 2 options:

**Option A: Use opencv4nodejs (Recommended)**
```powershell
cd web
npm install opencv4nodejs
```
Then update `web/lib/omr-processor.ts` to use the Node.js OpenCV bindings.

**Option B: Use Python Microservice**
Create a separate Python service with OpenCV and call it from the API route.

**Option C: Deploy Supabase Edge Function**
See `DEPLOYMENT_GUIDE.md` for details (more complex).

### 🎯 Current Workflow:

```
Mobile Scanner
  ↓ (auto-detects paper)
  ↓ (captures image)
  ↓ (uploads to Supabase Storage: scan-images/{exam_id}/{filename}.jpg)
  ↓
Next.js API (/api/scans/process)
  ↓ (downloads image)
  ↓ (gets exam details)
  ↓ (processes with mock data)
  ↓ (saves to database)
  ↓
Mobile Scanner
  ✓ (shows score/results)
```

### 🎨 Scanner Features:

- **🤖 Auto-Capture**: Detects paper and captures automatically
- **👆 Manual Mode**: Traditional capture button
- **📐 Responsive Guides**: Corner markers match template size
- **🎯 Template Frame**: Dashed border shows scan area
- **💬 Status Messages**: "Looking for paper...", "Paper detected!", "Processing..."
- **🔄 Retry Logic**: 3 attempts with guidance
- **✅ Exam Validation**: Prevents scanning wrong sheets
- **⚙️ Calibration**: Adjustable bubble sensitivity

### 📱 Testing Checklist:

- [ ] Web server running on localhost:3001
- [ ] Mobile app connected (Expo)
- [ ] Create an exam in web dashboard
- [ ] Generate and view template PDF
- [ ] Open exam in mobile app
- [ ] Test auto-capture (should detect paper automatically)
- [ ] Test manual mode (toggle button)
- [ ] Verify processing works (shows mock score)
- [ ] Check database for saved scan

### ⚠️ Important Notes:

1. **CORS**: The mobile app must be able to reach `http://localhost:3001`
   - On physical device, use your computer's IP instead (e.g., `http://192.168.1.100:3001`)
   - Update line ~167 in `ScannerScreen.tsx`

2. **Network**: Make sure phone and computer are on same WiFi

3. **Mock Data**: Current processing returns test data (Student ID: varies, Score: random)

### 🔄 To Use Your Computer's IP:

If testing on a physical device:

1. Find your computer's IP:
   ```powershell
   ipconfig
   # Look for IPv4 Address (e.g., 192.168.1.100)
   ```

2. Update `mobile/screens/ScannerScreen.tsx` line ~167:
   ```typescript
   const webApiUrl = 'http://192.168.1.100:3001' // Your computer's IP
   ```

---

**Status**: ✅ Scanner working with auto-capture and real API calls
**Next Step**: Implement real OpenCV processing or test with mock data
**Last Updated**: January 22, 2026
