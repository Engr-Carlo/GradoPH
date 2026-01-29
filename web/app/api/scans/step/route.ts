import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import jsQR from 'jsqr'

// Template coordinates matching generateTemplate.ts
const TEMPLATE = {
  width: 850,
  height: 1100,
  
  // QR Code position (top right area)
  qrCode: {
    x: 650,
    y: 60,
    size: 150, // QR code is approximately 150x150
  },
  
  // Student ID grid position
  studentId: {
    startX: 60,
    startY: 220,
    bubbleRadius: 8,
    spacingX: 24, // horizontal spacing between columns
    spacingY: 22, // vertical spacing between rows
    numDigits: 10,
    digitsPerColumn: 10, // 0-9
  },
  
  // Answer grid position
  answers: {
    startX: 60,
    startY: 500,
    bubbleRadius: 7,
    spacingX: 20, // horizontal spacing between A,B,C,D
    spacingY: 22, // vertical spacing between questions
    columnWidth: 200, // horizontal offset between question columns
    questionsPerColumn: 25,
    optionsPerQuestion: 4, // A, B, C, D
  },
}

// Helper to detect filled bubbles
async function detectBubble(
  imageBuffer: Buffer,
  x: number,
  y: number,
  radius: number,
  imageWidth: number
): Promise<{ isFilled: boolean; darkness: number }> {
  try {
    const sampleSize = Math.max(1, Math.floor(radius * 0.8))
    const left = Math.max(0, Math.round(x - sampleSize))
    const top = Math.max(0, Math.round(y - sampleSize))
    const size = sampleSize * 2

    const region = await sharp(imageBuffer)
      .extract({ left, top, width: size, height: size })
      .greyscale()
      .raw()
      .toBuffer()

    const pixels = Array.from(region)
    const avgBrightness = pixels.reduce((a, b) => a + b, 0) / pixels.length
    const darkness = 255 - avgBrightness

    // Lower threshold for detection (adjust as needed)
    const isFilled = darkness > 80

    return { isFilled, darkness }
  } catch (error) {
    return { isFilled: false, darkness: 0 }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image_base64, step, exam_id } = body

    if (!image_base64) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 })
    }

    if (!step || !['qr', 'student_id', 'answers'].includes(step)) {
      return NextResponse.json({ success: false, error: 'Invalid step. Must be: qr, student_id, or answers' }, { status: 400 })
    }

    // Decode base64 image
    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata()
    const { width: imgWidth, height: imgHeight } = metadata

    if (!imgWidth || !imgHeight) {
      return NextResponse.json({ success: false, error: 'Invalid image' }, { status: 400 })
    }

    // Calculate scale factors
    const scaleX = imgWidth / TEMPLATE.width
    const scaleY = imgHeight / TEMPLATE.height

    console.log(`\n=== STEP SCAN: ${step.toUpperCase()} ===`)
    console.log(`Image: ${imgWidth}x${imgHeight}, Scale: ${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`)

    // Step 1: QR Code Detection
    if (step === 'qr') {
      return await scanQRCode(imageBuffer, imgWidth, imgHeight, scaleX, scaleY, exam_id)
    }

    // Step 2: Student ID Detection
    if (step === 'student_id') {
      return await scanStudentId(imageBuffer, scaleX, scaleY)
    }

    // Step 3: Answer Detection
    if (step === 'answers') {
      const numQuestions = body.num_questions || 100
      return await scanAnswers(imageBuffer, scaleX, scaleY, numQuestions)
    }

    return NextResponse.json({ success: false, error: 'Unknown step' }, { status: 400 })

  } catch (error: any) {
    console.error('Step scan error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Processing failed',
    }, { status: 500 })
  }
}

// Step 1: Scan QR Code
async function scanQRCode(
  imageBuffer: Buffer,
  imgWidth: number,
  imgHeight: number,
  scaleX: number,
  scaleY: number,
  expectedExamId?: string
) {
  try {
    // Extract QR code region (with some padding)
    const qrX = Math.round(TEMPLATE.qrCode.x * scaleX) - 20
    const qrY = Math.round(TEMPLATE.qrCode.y * scaleY) - 20
    const qrSize = Math.round(TEMPLATE.qrCode.size * Math.max(scaleX, scaleY)) + 40

    // Ensure we stay within bounds
    const extractX = Math.max(0, qrX)
    const extractY = Math.max(0, qrY)
    const extractWidth = Math.min(qrSize, imgWidth - extractX)
    const extractHeight = Math.min(qrSize, imgHeight - extractY)

    console.log(`QR Region: x=${extractX}, y=${extractY}, size=${extractWidth}x${extractHeight}`)

    // Extract and prepare QR region
    const qrRegion = await sharp(imageBuffer)
      .extract({ left: extractX, top: extractY, width: extractWidth, height: extractHeight })
      .greyscale()
      .normalise()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Use jsQR to decode
    const qrCode = jsQR(
      new Uint8ClampedArray(qrRegion.data),
      qrRegion.info.width,
      qrRegion.info.height
    )

    if (!qrCode) {
      // Try scanning the full image as fallback
      console.log('QR not found in region, trying full image...')
      
      const fullImage = await sharp(imageBuffer)
        .greyscale()
        .normalise()
        .resize(800, 1000, { fit: 'inside' }) // Resize for faster processing
        .raw()
        .toBuffer({ resolveWithObject: true })

      const fullQrCode = jsQR(
        new Uint8ClampedArray(fullImage.data),
        fullImage.info.width,
        fullImage.info.height
      )

      if (!fullQrCode) {
        return NextResponse.json({
          success: false,
          step: 'qr',
          error: 'QR code not detected',
          hint: 'Make sure the QR code in the top-right corner is visible and clear',
        })
      }

      return processQRResult(fullQrCode.data, expectedExamId)
    }

    return processQRResult(qrCode.data, expectedExamId)

  } catch (error: any) {
    console.error('QR scan error:', error)
    return NextResponse.json({
      success: false,
      step: 'qr',
      error: 'QR scan failed: ' + error.message,
    })
  }
}

function processQRResult(qrData: string, expectedExamId?: string) {
  console.log('QR Code detected:', qrData)

  // Parse QR data - expected format: "EXAM:exam_id" or just exam_id
  let examId = qrData
  if (qrData.startsWith('EXAM:')) {
    examId = qrData.replace('EXAM:', '')
  }

  // Validate against expected exam
  if (expectedExamId && examId !== expectedExamId) {
    return NextResponse.json({
      success: false,
      step: 'qr',
      error: 'Wrong exam sheet',
      detected_exam_id: examId,
      expected_exam_id: expectedExamId,
      hint: 'This bubble sheet is for a different exam',
    })
  }

  return NextResponse.json({
    success: true,
    step: 'qr',
    exam_id: examId,
    raw_data: qrData,
    message: 'QR code verified! Proceed to scan Student ID.',
  })
}

// Step 2: Scan Student ID
async function scanStudentId(imageBuffer: Buffer, scaleX: number, scaleY: number) {
  const { studentId } = TEMPLATE
  const detectedDigits: string[] = []
  const debugInfo: any[] = []

  for (let col = 0; col < studentId.numDigits; col++) {
    let maxDarkness = 0
    let detectedDigit = ''
    const columnDebug: any = { column: col, bubbles: [] }

    for (let row = 0; row < studentId.digitsPerColumn; row++) {
      const x = (studentId.startX + col * studentId.spacingX) * scaleX
      const y = (studentId.startY + row * studentId.spacingY) * scaleX

      const { isFilled, darkness } = await detectBubble(
        imageBuffer,
        x,
        y,
        studentId.bubbleRadius * scaleX,
        TEMPLATE.width * scaleX
      )

      columnDebug.bubbles.push({ digit: row, darkness: Math.round(darkness), filled: isFilled })

      if (isFilled && darkness > maxDarkness) {
        maxDarkness = darkness
        detectedDigit = row.toString()
      }
    }

    detectedDigits.push(detectedDigit || '?')
    debugInfo.push(columnDebug)
  }

  const studentIdStr = detectedDigits.join('')
  const confidence = detectedDigits.filter(d => d !== '?').length / studentId.numDigits * 100
  const hasUndetected = detectedDigits.includes('?')

  console.log(`Student ID detected: ${studentIdStr} (${confidence}% confidence)`)

  if (confidence < 50) {
    return NextResponse.json({
      success: false,
      step: 'student_id',
      error: 'Could not read Student ID',
      partial_id: studentIdStr,
      confidence: Math.round(confidence),
      debug: debugInfo,
      hint: 'Make sure the Student ID bubbles are filled in darkly',
    })
  }

  return NextResponse.json({
    success: true,
    step: 'student_id',
    student_id: studentIdStr,
    confidence: Math.round(confidence),
    has_undetected: hasUndetected,
    debug: debugInfo,
    message: hasUndetected 
      ? `Student ID partially detected: ${studentIdStr}. Some digits unclear.`
      : `Student ID detected: ${studentIdStr}. Proceed to scan answers.`,
  })
}

// Step 3: Scan Answers
async function scanAnswers(
  imageBuffer: Buffer,
  scaleX: number,
  scaleY: number,
  numQuestions: number
) {
  const { answers } = TEMPLATE
  const OPTIONS = ['A', 'B', 'C', 'D']
  const detectedAnswers: string[] = []
  const debugInfo: any[] = []

  for (let q = 0; q < numQuestions; q++) {
    const column = Math.floor(q / answers.questionsPerColumn)
    const row = q % answers.questionsPerColumn

    let maxDarkness = 0
    let detectedAnswer = ''
    const questionDebug: any = { question: q + 1, bubbles: [] }

    for (let opt = 0; opt < answers.optionsPerQuestion; opt++) {
      const x = (answers.startX + column * answers.columnWidth + opt * answers.spacingX) * scaleX
      const y = (answers.startY + row * answers.spacingY) * scaleY

      const { isFilled, darkness } = await detectBubble(
        imageBuffer,
        x,
        y,
        answers.bubbleRadius * scaleX,
        TEMPLATE.width * scaleX
      )

      questionDebug.bubbles.push({ option: OPTIONS[opt], darkness: Math.round(darkness), filled: isFilled })

      if (isFilled && darkness > maxDarkness) {
        maxDarkness = darkness
        detectedAnswer = OPTIONS[opt]
      }
    }

    detectedAnswers.push(detectedAnswer || '')
    debugInfo.push(questionDebug)
  }

  const answeredCount = detectedAnswers.filter(a => a !== '').length
  const confidence = (answeredCount / numQuestions) * 100

  console.log(`Answers detected: ${answeredCount}/${numQuestions} (${confidence.toFixed(1)}% filled)`)

  return NextResponse.json({
    success: true,
    step: 'answers',
    answers: detectedAnswers,
    answered_count: answeredCount,
    total_questions: numQuestions,
    confidence: Math.round(confidence),
    debug: debugInfo.slice(0, 10), // Only first 10 for debugging
    message: `Detected ${answeredCount} answers out of ${numQuestions} questions.`,
  })
}
