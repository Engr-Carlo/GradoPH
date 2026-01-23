# Scanner Testing Guide

## Prerequisites
- ✅ Database migration completed
- ✅ Web server running (Next.js)
- ✅ Mobile app running (Expo)
- ✅ Printer available for template testing

## Phase 1: Web Dashboard Testing

### 1.1 Create New Exam
```
1. Navigate to http://localhost:3000/dashboard/exams
2. Click "Create New Exam"
3. Fill in exam details:
   - Exam Name: "Math Midterm Test"
   - Class: Select a class
   - Number of Questions: 20
4. Click "Create Exam"
5. Verify exam appears in list
```

**Expected Results**:
- Exam created successfully
- exam_code_hash saved to database (check in Supabase dashboard)

### 1.2 Generate Template
```
1. Click on newly created exam
2. Click "Generate Template" button
3. Wait for PDF generation
4. Download the template
5. Open PDF and inspect:
   - Should see 32 vertical bars (barcode) on left side
   - Should see corner markers (squares at 4 corners)
   - Should see student ID bubble grid
   - Should see answer bubbles
```

**Expected Results**:
- PDF contains custom barcode (not QR code)
- Barcode is 8 digits encoded as 32 vertical bars
- All alignment markers present

### 1.3 Print Template
```
1. Print the generated template on standard paper
2. Verify print quality:
   - Corners are clearly visible
   - Barcode bars are distinct
   - Bubbles are crisp circles
3. Fill in some bubbles with dark pen/pencil
```

## Phase 2: Mobile App Testing

### 2.1 Calibration Setup
```
1. Open mobile app
2. Login if needed
3. Navigate to exams list
4. Tap on "Math Midterm Test"
5. Tap "⚙️ Calibrate Scanner"
```

**Expected Results**:
- Navigation to CalibrationScreen works
- Camera permissions requested (if first time)

### 2.2 Threshold Calibration
```
1. Grant camera permission
2. Point camera at printed template
3. Tap "Capture Test Image"
4. Observe detection preview:
   - Should show 10 questions
   - Each with 4 bubbles
   - Filled bubbles should be marked
5. Adjust slider (20-70%)
6. Observe bubble color changes:
   - Green = detected as filled (> threshold)
   - Gray = not filled
7. Find optimal threshold where filled bubbles are green
8. Tap "Save Threshold"
```

**Expected Results**:
- Threshold persists after saving
- Confirmation alert appears
- Navigation back to exam detail

### 2.3 Scanner Basic Test
```
1. Return to exam detail
2. Tap "Start Scanning"
3. Grant camera permission (if needed)
4. Tap "Show Guides" button
```

**Expected Results**:
- 4 green corner guides appear
- Position labels visible:
  - "QR Code Area" (bottom-left)
  - "Student ID Bubbles" (bottom-right)

### 2.4 Alignment Test
```
1. Position printed template in view
2. Align template corners with green guides
3. Verify guides match template corner markers
4. Toggle "Hide Guides" to see clear view
5. Toggle "Show Guides" again
```

**Expected Results**:
- Guides help align template
- Template corners visible in guide boxes

### 2.5 First Scan Attempt
```
1. Hold phone steady
2. Ensure good lighting
3. Align corners with guides
4. Tap "Capture" button
5. Wait for processing
```

**Possible Outcomes**:
- ✅ **Success**: Shows detected student ID and answers
- ⚠️ **Low Confidence**: Shows retry message
- ❌ **Wrong Exam**: "Wrong Exam Sheet" alert

### 2.6 Retry System Test
```
If low confidence:
1. Read guidance message (e.g., "Move closer")
2. Adjust position/lighting as suggested
3. Tap "Retry" button
4. Repeat up to 3 times
```

**Expected Results**:
- Different guidance each attempt:
  - Attempt 1: "Move closer to the sheet"
  - Attempt 2: "Ensure better lighting"
  - Attempt 3: "Align corners carefully"
- After 3rd failure: Manual entry option appears

## Phase 3: Validation Testing

### 3.1 Exam Hash Validation
```
1. Print template for Exam A
2. In app, open Exam B (different exam)
3. Try to scan Exam A's template
```

**Expected Result**:
- Alert: "Wrong Exam Sheet Detected"
- Scan rejected
- Must scan correct exam template

### 3.2 Student ID Detection
```
1. Fill student ID bubbles on template (e.g., 12345)
2. Scan template
3. Check detected student ID
```

**Expected Result**:
- Student ID correctly detected from bubbles
- Confidence score shown
- If misread, retry with better filling/lighting

### 3.3 Answer Detection
```
1. Fill answer bubbles (mark answers for questions 1-20)
2. Scan template
3. Verify detected answers match filled bubbles
```

**Expected Result**:
- Answers correctly detected
- High confidence (>70%) for clearly marked bubbles
- Lower confidence for lightly marked bubbles

### 3.4 Edge Cases

**Test 3.4.1: Multiple Marks**
```
1. Fill 2 bubbles for same question
2. Scan
```
Expected: Should detect strongest mark or flag as error

**Test 3.4.2: No Marks**
```
1. Leave some questions blank
2. Scan
```
Expected: Should handle blank questions gracefully

**Test 3.4.3: Light Marks**
```
1. Fill some bubbles lightly
2. Scan
```
Expected: May need threshold adjustment in calibration

**Test 3.4.4: Poor Lighting**
```
1. Scan in dim lighting
2. Observe confidence scores
```
Expected: Retry guidance suggests better lighting

**Test 3.4.5: Misaligned Sheet**
```
1. Deliberately misalign template
2. Don't use corner guides
3. Scan
```
Expected: Low confidence, retry guidance suggests alignment

## Phase 4: Performance Testing

### 4.1 Scan Speed
```
1. Time full scan workflow:
   - Camera ready → Capture → Processing → Results
```

**Target**: Under 5 seconds for full cycle

### 4.2 Threshold Persistence
```
1. Set threshold to 35%
2. Save
3. Close app completely
4. Reopen app
5. Go to calibration
```

**Expected**: Threshold still at 35%

### 4.3 Multiple Scans
```
1. Scan same template 5 times
2. Compare results
```

**Expected**: Consistent results across scans

## Phase 5: Error Handling

### 5.1 Network Error
```
1. Disable internet
2. Try to scan
```

**Expected**: Error message about network connectivity

### 5.2 Camera Permission Denied
```
1. Deny camera permission
2. Try to scan
```

**Expected**: Permission request or settings prompt

### 5.3 Invalid Template
```
1. Try to scan blank paper
2. Or scan upside-down template
```

**Expected**: Graceful failure with retry option

## Troubleshooting

### Issue: Barcode Not Detected
**Solutions**:
- Verify barcode printed clearly
- Ensure good contrast (black bars on white)
- Check barcode position (should be at x=65, y=700)

### Issue: Bubbles Not Detected
**Solutions**:
- Adjust threshold in calibration
- Use darker pen/pencil
- Fill bubbles completely
- Improve lighting

### Issue: Wrong Exam Alert
**Solutions**:
- Verify scanning correct template for selected exam
- Check exam_code_hash matches in database
- Regenerate template if needed

### Issue: Low Confidence Scores
**Solutions**:
- Recalibrate threshold
- Better lighting
- Align corners precisely
- Use darker marks
- Hold camera steady

## Success Criteria

✅ **Template Generation**: PDF contains custom barcode, all markers visible
✅ **Calibration**: Threshold adjustment changes detection, saves persistently  
✅ **Alignment**: Corner guides help position template correctly
✅ **Barcode Reading**: Custom barcode decodes to correct exam hash
✅ **Exam Validation**: Rejects wrong exam sheets
✅ **Bubble Detection**: Accurately reads filled bubbles (>90% accuracy)
✅ **Student ID**: Correctly detects ID from bubble grid
✅ **Retry System**: Provides helpful guidance after failures
✅ **Performance**: Full scan completes in <5 seconds

## Reporting Issues

If you encounter bugs, document:
1. What you were testing
2. Expected behavior
3. Actual behavior
4. Screenshots/photos
5. Error messages
6. Console logs (mobile/web)

Check these logs:
- **Mobile**: Expo console output
- **Web**: Browser developer tools console
- **Server**: Edge Function logs in Supabase dashboard

---

**Test Date**: _____________
**Tester**: _____________
**Results**: _____________
