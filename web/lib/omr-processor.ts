/**
 * OMR Bubble Detection Processor
 * Server-side image processing for optical mark recognition
 */

import { metadata } from "@/app/layout"

interface OMRConfig {
  num_questions: number
  student_id_length: number
  bubble_threshold?: number // Configurable threshold (20-70%, default 50%)
  template_width?: number
  template_height?: number
}

interface BubbleDetectionResult {
  question_number?: number
  digit_position?: number
  detected_answers: string[]
  confidence: number
  filled_percentage: number
}

interface OMRProcessingResult {
  success: boolean
  confidence: number
  student_id: {
    student_id: string
    confidence: number
  }
  answers: BubbleDetectionResult[]
  metadata?: {
    exam_id: string
    exam_name: string
    num_questions: number
  }
  error?: string
}

/**
 * Process OMR image using browser-based OpenCV.js
 * This runs on Vercel serverless functions
 */
export async function processOMRImage(
  imageBuffer: Buffer | Blob,
  config: OMRConfig
): Promise<OMRProcessingResult> {
  try {
    // Load OpenCV.js dynamically (will be loaded in API route)
    const cv = (global as any).cv
    if (!cv) {
      throw new Error('OpenCV.js not loaded. Make sure to load it in the API route.')
    }

    // Convert buffer/blob to base64
    let imageDataUrl: string
    if (imageBuffer instanceof Blob) {
      imageDataUrl = await blobToBase64(imageBuffer)
    } else {
      imageDataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
    }

    // Load image into OpenCV Mat
    const img = await loadImage(imageDataUrl)
    const src = cv.imread(img)

    // Step 1: Decode custom barcode to extract exam hash
    const barcodeData = await decodeCustomBarcode(src, cv)

    // Step 2: Detect corner markers and perform perspective correction
    const warped = await perspectiveCorrection(src, cv)

    // Step 3: Convert to grayscale and apply adaptive thresholding
    const gray = new cv.Mat()
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY)
    
    const binary = new cv.Mat()
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2)

    // Step 4: Extract student ID bubbles
    const bubbleThreshold = config.bubble_threshold || 50
    const studentIdResult = await extractStudentID(binary, cv, config.student_id_length, bubbleThreshold)

    // Step 5: Extract answer bubbles
    const answerResults = await extractAnswers(binary, cv, config.num_questions, bubbleThreshold)

    // Calculate overall confidence
    const allConfidences = [
      studentIdResult.confidence,
      ...answerResults.map(a => a.confidence)
    ]
    const overallConfidence = allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length

    // Cleanup
    src.delete()
    warped.delete()
    gray.delete()
    binary.delete()

    return {
      success: true,
      confidence: Math.round(overallConfidence),
      student_id: studentIdResult,
      answers: answerResults,
      metadata: barcodeData // Now contains exam_code_hash instead of QR data
    }
  } catch (error) {
    console.error('OMR Processing Error:', error)
    return {
      success: false,
      confidence: 0,
      student_id: { student_id: '', confidence: 0 },
      answers: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Decode custom stacked binary barcode and match to exam
 */
async function decodeCustomBarcode(src: any, cv: any): Promise<any> {
  try {
    // Barcode location: left side at x≈50-70px, Cartesian y=-150
    // For 850x1100 canvas with center at (425, 550):
    // x_canvas = 425 + (-360) = 65
    // y_top_canvas = 550 - (-150) = 700
    const barcodeX = 65
    const barcodeYTop = 700
    const barcodeWidth = 20
    const barHeight = 8
    const barGap = 6
    const totalBars = 32 // 8 digits × 4 bits per digit = 32 bars
    
    // Extract ROI for barcode
    const rect = new cv.Rect(barcodeX, barcodeYTop, barcodeWidth, totalBars * (barHeight + barGap))
    const barcodeROI = src.roi(rect)
    
    // Convert to grayscale
    const gray = new cv.Mat()
    cv.cvtColor(barcodeROI, gray, cv.COLOR_RGBA2GRAY)
    
    // Threshold to binary
    const binary = new cv.Mat()
    cv.threshold(gray, binary, 127, 255, cv.THRESH_BINARY)
    
    // Scan vertically to detect bars (black = 1, white = 0)
    const bits: number[] = []
    for (let i = 0; i < totalBars; i++) {
      const y = i * (barHeight + barGap) + barHeight / 2
      const rowRect = new cv.Rect(barcodeWidth / 4, y, barcodeWidth / 2, 1)
      const row = binary.roi(rowRect)
      
      // Count black pixels
      const blackPixels = cv.countNonZero(row)
      const whitePixels = (barcodeWidth / 2) - blackPixels
      
      // If more than 50% black, it's a 1
      bits.push(blackPixels > whitePixels ? 1 : 0)
      row.delete()
    }
    
    // Decode BCD: every 4 bits = 1 digit
    let examCodeStr = ''
    for (let i = 0; i < 8; i++) {
      const nibble = bits.slice(i * 4, i * 4 + 4)
      const digit = nibble[0] * 8 + nibble[1] * 4 + nibble[2] * 2 + nibble[3] * 1
      examCodeStr += digit.toString()
    }
    
    const examCodeHash = parseInt(examCodeStr, 10)
    
    // Cleanup
    barcodeROI.delete()
    gray.delete()
    binary.delete()
    
    return {
      exam_code_hash: examCodeHash,
      raw_code: examCodeStr,
      confidence: 95 // High confidence if we successfully decoded
    }
  } catch (error) {
    console.error('Barcode decoding error:', error)
    return {
      exam_code_hash: null,
      raw_code: '',
      confidence: 0
    }
  }
}

/**
 * Detect QR code and extract exam metadata (DEPRECATED - using custom barcode instead)
 */
async function detectQRCode(src: any, cv: any): Promise<any> {
  try {
    // QR code detection using OpenCV
    const qrDecoder = new cv.QRCodeDetector()
    const points = new cv.Mat()
    const decoded = qrDecoder.detectAndDecode(src, points)
    points.delete()
    
    if (decoded) {
      return JSON.parse(decoded)
    }
  } catch (error) {
    console.warn('QR code detection failed:', error)
  }
  return null
}

/**
 * Detect corner markers and perform perspective transformation
 */
async function perspectiveCorrection(src: any, cv: any): Promise<any> {
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  
  // Apply threshold to find black squares
  const binary = new cv.Mat()
  cv.threshold(gray, binary, 127, 255, cv.THRESH_BINARY_INV)
  
  // Find contours
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
  
  // Find 4 largest square-like contours (corner markers)
  const corners: Array<{x: number, y: number, area: number}> = []
  
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i)
    const area = cv.contourArea(cnt)
    
    // Filter by area (corner markers should be ~22x22 = 484 pixels)
    if (area > 200 && area < 1000) {
      const moments = cv.moments(cnt)
      const cx = moments.m10 / moments.m00
      const cy = moments.m01 / moments.m00
      corners.push({ x: cx, y: cy, area })
    }
    cnt.delete()
  }
  
  // Sort corners by area and take top 4
  corners.sort((a, b) => b.area - a.area)
  const topCorners = corners.slice(0, 4)
  
  if (topCorners.length === 4) {
    // Sort corners: top-left, top-right, bottom-right, bottom-left
    const sorted = sortCorners(topCorners)
    
    // Define source and destination points
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      sorted[0].x, sorted[0].y,
      sorted[1].x, sorted[1].y,
      sorted[2].x, sorted[2].y,
      sorted[3].x, sorted[3].y
    ])
    
    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      850, 0,
      850, 1100,
      0, 1100
    ])
    
    // Get perspective transform matrix
    const M = cv.getPerspectiveTransform(srcPoints, dstPoints)
    
    // Apply transform
    const warped = new cv.Mat()
    const dsize = new cv.Size(850, 1100)
    cv.warpPerspective(src, warped, M, dsize)
    
    // Cleanup
    srcPoints.delete()
    dstPoints.delete()
    M.delete()
    gray.delete()
    binary.delete()
    contours.delete()
    hierarchy.delete()
    
    return warped
  }
  
  // If corner detection failed, return original
  gray.delete()
  binary.delete()
  contours.delete()
  hierarchy.delete()
  
  console.warn('Corner detection failed, using original image')
  return src.clone()
}

/**
 * Sort corners in clockwise order from top-left
 */
function sortCorners(corners: Array<{x: number, y: number}>): Array<{x: number, y: number}> {
  // Find centroid
  const cx = corners.reduce((sum, c) => sum + c.x, 0) / corners.length
  const cy = corners.reduce((sum, c) => sum + c.y, 0) / corners.length
  
  // Sort by angle from centroid
  const withAngles = corners.map(c => ({
    ...c,
    angle: Math.atan2(c.y - cy, c.x - cx)
  }))
  
  withAngles.sort((a, b) => a.angle - b.angle)
  
  // Reorder to start from top-left
  const topLeftIndex = withAngles.findIndex(c => c.x < cx && c.y < cy)
  if (topLeftIndex >= 0) {
    return [
      withAngles[topLeftIndex],
      withAngles[(topLeftIndex + 1) % 4],
      withAngles[(topLeftIndex + 2) % 4],
      withAngles[(topLeftIndex + 3) % 4]
    ]
  }
  
  return withAngles
}

/**
 * Extract student ID from bubble grid with configurable threshold
 */
async function extractStudentID(
  binary: any,
  cv: any,
  length: number,
  threshold: number = 50
): Promise<{ student_id: string; confidence: number }> {
  const digits: string[] = []
  const confidences: number[] = []
  
  // Student ID is in bottom-right area
  // Based on template: Cartesian (350, -450) = canvas (~775, ~1000)
  const startX = 650
  const startY = 700
  const digitSpacing = 22
  const bubbleRadius = 8
  const rowHeight = 23
  
  for (let digitPos = 0; digitPos < Math.min(length, 10); digitPos++) {
    const bubbleX = startX + digitPos * digitSpacing + 10
    let maxFilled = 0
    let detectedDigit = '0'
    
    for (let num = 0; num <= 9; num++) {
      const bubbleY = startY + num * rowHeight
      
      // Extract bubble region with error handling
      try {
        const roi = binary.roi(new cv.Rect(
          Math.max(0, bubbleX - bubbleRadius),
          Math.max(0, bubbleY - bubbleRadius),
          bubbleRadius * 2,
          bubbleRadius * 2
        ))
        
        // Count white pixels (filled bubble in inverted binary)
        const filledPixels = cv.countNonZero(roi)
        const totalPixels = roi.rows * roi.cols
        const fillPercentage = (filledPixels / totalPixels) * 100
        
        roi.delete()
        
        if (fillPercentage > maxFilled) {
          maxFilled = fillPercentage
          detectedDigit = num.toString()
        }
      } catch (error) {
        console.warn(`Error extracting bubble at digit ${digitPos}, num ${num}:`, error)
      }
    }
    
    digits.push(detectedDigit)
    // Use configurable threshold for confidence
    const confidence = maxFilled > threshold ? 95 : (maxFilled > threshold * 0.6 ? 70 : 40)
    confidences.push(confidence)
  }
  
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length
  
  return {
    student_id: digits.join(''),
    confidence: Math.round(avgConfidence)
  }
}

/**
 * Extract answers from bubble grid with configurable threshold
 */
async function extractAnswers(
  binary: any,
  cv: any,
  numQuestions: number,
  threshold: number = 50
): Promise<BubbleDetectionResult[]> {
  const results: BubbleDetectionResult[] = []
  
  // Answer bubbles are in left-center area
  // Based on template: 4 columns, varying questions per column
  const leftMargin = 125
  const topY = 275
  const verticalSpacing = 23
  const horizontalSpacing = 24
  const bubbleRadius = 8
  const choices = ['A', 'B', 'C', 'D']
  
  const questionsPerColumn = Math.ceil(numQuestions / 4)
  
  for (let q = 1; q <= numQuestions; q++) {
    // Determine column and position
    const columnIndex = Math.floor((q - 1) / questionsPerColumn)
    const indexInColumn = (q - 1) % questionsPerColumn
    
    const baseX = leftMargin + columnIndex * (150 + horizontalSpacing)
    const questionY = topY + indexInColumn * verticalSpacing
    
    const choiceFills: Array<{choice: string, fill: number}> = []
    
    for (let i = 0; i < choices.length; i++) {
      const bubbleX = baseX + 30 + i * horizontalSpacing
      
      try {
        // Extract bubble region
        const roi = binary.roi(new cv.Rect(
          Math.max(0, bubbleX - bubbleRadius),
          Math.max(0, questionY - bubbleRadius),
          bubbleRadius * 2,
          bubbleRadius * 2
        ))
        
        // Count filled pixels
        const filledPixels = cv.countNonZero(roi)
        const totalPixels = roi.rows * roi.cols
        const fillPercentage = (filledPixels / totalPixels) * 100
        
        roi.delete()
        
        choiceFills.push({ choice: choices[i], fill: fillPercentage })
      } catch (error) {
        choiceFills.push({ choice: choices[i], fill: 0 })
      }
    }
    
    // Sort by fill percentage
    choiceFills.sort((a, b) => b.fill - a.fill)
    
    // Detect answer using configurable threshold
    const topChoice = choiceFills[0]
    const minThreshold = threshold * 0.6 // 60% of configured threshold as minimum
    const confidence = topChoice.fill > threshold ? 95 : (topChoice.fill > minThreshold ? 70 : 40)
    
    results.push({
      question_number: q,
      detected_answers: topChoice.fill > minThreshold ? [topChoice.choice] : [],
      confidence,
      filled_percentage: Math.round(topChoice.fill)
    })
  }
  
  return results
}

/**
 * Helper: Convert Blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Helper: Load image from data URL
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}
