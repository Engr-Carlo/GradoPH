# OMR Testing Guide

## Quick Test Steps

### 1. Web Test (Fastest - Start Here)

1. **Navigate to test page**:
   - Open https://your-app.vercel.app/dashboard/exams/test
   - Login with your teacher account

2. **Generate and download test template**:
   - Student ID: `1234567890` (pre-filled)
   - Answers: First 10 questions set to A, B, C, D, E, A, B, C, D, E
   - Click **"Download PDF"** or **"Download PNG"**

3. **Test the scan**:
   - Click **"Test Scan"** button
   - Should show **100% accuracy** for both Student ID and Answers
   - Review the fill ratio percentages (should be ~67% for marked bubbles)

**Expected Results**:
- ✅ Student ID: 100% (10/10 digits correct)
- ✅ Answers: 100% (10/10 answers correct)
- Fill ratios around 60-70% indicate properly detected bubbles

---

### 2. Mobile Test (End-to-End)

1. **Start Expo**:
   ```powershell
   cd mobile
   npm start
   ```

2. **Open app**:
   - Scan QR code with Expo Go
   - Login with teacher credentials

3. **Access test scanner**:
   - From Exams list, tap **"🔬 Test"** button in header
   - Or navigate to Test Scanner screen

4. **Test options**:
   - **Option A**: Pick test image from gallery
     - Download the test template PNG from web
     - Transfer to phone
     - Pick from gallery
   
   - **Option B**: Take photo of printed template
     - Print the test PDF at 100% scale
     - Fill bubbles with #2 pencil
     - Use camera to capture

5. **Run test scan**:
   - Tap **"🔬 Test Scan"**
   - Wait for processing
   - View accuracy results

**Expected Results**:
- Student ID and Answer accuracy cards
- Side-by-side comparison of expected vs detected
- Fill ratio percentages for each bubble
- Green checkmarks for correct detections

---

### 3. Physical Print Test (Production Validation)

1. **Generate template from web**:
   - Go to `/dashboard/exams`
   - Select an exam
   - Download template PDF

2. **Print settings**:
   - ⚠️ **Critical**: Print at 100% scale (no "fit to page")
   - Use white letter-size paper (8.5" × 11")
   - Laser printer preferred (inkjet works too)

3. **Fill bubbles**:
   - Use #2 pencil or black pen
   - Fill bubbles completely
   - Make dark, solid marks

4. **Scan with mobile**:
   - From exam detail screen, tap "Scan Exam"
   - Position paper within corner guides
   - Wait for auto-capture or tap manually
   - Review detected results

**Troubleshooting**:
- **Low confidence (<80%)**: Ensure good lighting, paper flat, no shadows
- **Wrong student ID**: Check bubbles filled completely and darkly
- **Skewed/cropped**: Hold phone parallel to paper, all corners visible
- **Auto-capture not triggering**: All 4 corners must be detected for 3+ consecutive frames

---

## Test Template Specifications

The test template uses **exact OMR processor coordinates**:

- **Student ID**: 10 digits, starting at (110, 250)
- **Answers**: Questions 1-10, starting at (460, 250)
- **Bubble size**: 28px diameter
- **Spacing**: 38px vertical
- **Options**: A, B, C, D, E (5 options)
- **Corner markers**: 40px squares at all 4 corners

---

## Verification Checklist

### Web Test ✓
- [ ] Can generate test template (PDF + PNG)
- [ ] Test scan returns 100% accuracy
- [ ] Fill ratios show ~60-70% for marked bubbles
- [ ] Debug mode shows individual bubble detection

### Mobile Test ✓
- [ ] Test scanner screen accessible
- [ ] Can pick image from gallery
- [ ] Can take photo with camera
- [ ] Upload to storage succeeds
- [ ] API call returns results
- [ ] Results display correctly

### Physical Scan ✓
- [ ] Corner detection works on real paper
- [ ] Auto-capture triggers reliably
- [ ] Perspective correction handles skew
- [ ] Student ID reads correctly
- [ ] Answers match filled bubbles
- [ ] Confidence >80% consistently

---

## Common Issues

### "Failed to process scan"
- Check API URL in mobile `.env` or `app.json`
- Verify authentication token is valid
- Check Vercel deployment logs

### "Not authenticated"
- Login again in mobile app
- Check AsyncStorage has valid token
- Verify Supabase session not expired

### Low accuracy (<90%)
- Ensure template matches OMR coordinates
- Check bubble fill is dark and complete
- Verify print scale is 100%
- Test with web diagnostic first

### Auto-capture not working
- All 4 corners must be visible
- Hold phone 8-12 inches from paper
- Ensure good, even lighting
- Paper should be flat, not curved

---

## Next Steps After Testing

1. ✅ **If web test passes (100%)**: OMR processor is working perfectly
2. ✅ **If mobile test passes**: Camera, upload, and API integration working
3. ✅ **If physical scan passes**: Ready for production use

4. **Production rollout**:
   - Replace dynamic template with fixed layout (optional)
   - Train users on proper bubble filling
   - Print test sheets and scan in batches
   - Monitor confidence scores and adjust threshold if needed

5. **Optional improvements**:
   - Add bulk answer key import
   - Implement re-scan for low confidence
   - Add student roster CSV upload
   - Generate analytics dashboard
