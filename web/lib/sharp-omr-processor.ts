/**
 * OMR (Optical Mark Recognition) Processor using Sharp
 * 
 * Node.js-compatible OMR solution using Sharp for image processing.
 * OpenCV.js doesn't work well in serverless/Node.js environments,
 * so this provides a reliable alternative.
 * 
 * Template specifications:
 * - Image size: 850 x 1100 pixels
 * - Corner markers: 40px inset from edges
 * - Student ID: 10 columns of digits (0-9)
 * - Answers: 5 options per question (A-E)
 */

import sharp from 'sharp'

// Template layout constants (matching the template generator)
const TEMPLATE = {
  width: 850,
  height: 1100,
  cornerMarkerInset: 40,
  cornerMarkerSize: 15,
  
  // Student ID grid - adjust based on actual template
  studentIdStartX: 110,  // Starting X position for student ID bubbles
  studentIdStartY: 250,  // Starting Y position
  
  // Answer grid - adjust based on actual template
  answersStartX: 460,    // Starting X position for answer bubbles
  answersStartY: 250,    // Starting Y position
  
  // Bubble dimensions
  bubbleWidth: 18,
  bubbleHeight: 18,
  bubbleSpacingX: 25,    // Horizontal spacing between bubbles
  bubbleSpacingY: 30,    // Vertical spacing between rows
}

export interface SharpOMRResult {
  success: boolean
  confidence: number
  student_id: {
    student_id: string
    confidence: number
  }
  answers: {
    question_number: number
    detected_answers: string[]
    confidence: number
    filled_percentage: number
  }[]
  metadata: {
    processing_mode: string
    image_dimensions?: { width: number; height: number }
    corners_detected?: boolean
  }
  error?: string
}

/**
 * Main OMR processing function
 */
export async function processWithSharp(
  imageData: Buffer | ArrayBuffer | Blob,
  numQuestions: number,
  studentIdLength: number = 10,
  bubbleThreshold: number = 0.4  // 40% filled = marked
): Promise<SharpOMRResult> {
  try {
    // Convert input to Buffer
    let buffer: Buffer
    if (imageData instanceof Blob) {
      const arrayBuffer = await imageData.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else if (imageData instanceof ArrayBuffer) {
      buffer = Buffer.from(imageData)
    } else {
      buffer = imageData
    }

    // Load and preprocess image
    const image = sharp(buffer)
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not read image dimensions')
    }

    console.log(`Processing image: ${metadata.width}x${metadata.height}`)

    // Resize to template size and convert to grayscale
    const processed = await image
      .resize(TEMPLATE.width, TEMPLATE.height, { 
        fit: 'fill',
        kernel: 'lanczos3'  // High quality resize
      })
      .grayscale()
      .normalize()  // Improve contrast
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { data: pixelData, info } = processed
    
    // Verify corners are detected (alignment check)
    const cornersOk = verifyCorners(pixelData, info.width, info.height)

    // Extract student ID
    const studentIdResult = extractStudentId(
      pixelData,
      info.width,
      info.height,
      studentIdLength,
      bubbleThreshold
    )

    // Extract answers
    const answersResult = extractAnswers(
      pixelData,
      info.width,
      info.height,
      numQuestions,
      bubbleThreshold
    )

    // Calculate overall confidence
    const answerConfidences = answersResult.map(a => a.confidence)
    const avgAnswerConfidence = answerConfidences.length > 0 
      ? answerConfidences.reduce((a, b) => a + b, 0) / answerConfidences.length
      : 0
    
    const overallConfidence = Math.round(
      (studentIdResult.confidence * 0.3) + (avgAnswerConfidence * 0.7)
    )

    console.log(`OMR complete: Student ID=${studentIdResult.student_id}, Confidence=${overallConfidence}%`)

    return {
      success: true,
      confidence: overallConfidence,
      student_id: studentIdResult,
      answers: answersResult,
      metadata: {
        processing_mode: 'sharp-omr',
        image_dimensions: { 
          width: metadata.width, 
          height: metadata.height 
        },
        corners_detected: cornersOk
      }
    }
  } catch (error) {
    console.error('Sharp OMR Processing error:', error)

    // Return error result with empty data
    return {
      success: false,
      confidence: 0,
      student_id: {
        student_id: '0'.repeat(studentIdLength),
        confidence: 0
      },
      answers: Array.from({ length: numQuestions }, (_, i) => ({
        question_number: i + 1,
        detected_answers: [],
        confidence: 0,
        filled_percentage: 0
      })),
      metadata: {
        processing_mode: 'error-fallback'
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Verify corner markers are present for alignment check
 */
function verifyCorners(
  pixelData: Buffer,
  width: number,
  height: number
): boolean {
  const checkSize = 25
  const inset = TEMPLATE.cornerMarkerInset

  const corners = [
    { x: inset, y: inset },                          // Top-left
    { x: width - inset - checkSize, y: inset },      // Top-right
    { x: inset, y: height - inset - checkSize },     // Bottom-left
    { x: width - inset - checkSize, y: height - inset - checkSize }  // Bottom-right
  ]

  let foundCount = 0
  
  for (const corner of corners) {
    const fillRatio = getRegionDarkness(pixelData, width, corner.x, corner.y, checkSize, checkSize)
    if (fillRatio > 0.25) {  // 25% dark = corner marker present
      foundCount++
    }
  }

  return foundCount >= 3  // At least 3 corners found
}

/**
 * Extract student ID from bubble grid
 */
function extractStudentId(
  pixelData: Buffer,
  width: number,
  height: number,
  idLength: number,
  threshold: number
): { student_id: string; confidence: number } {
  const digits: string[] = []
  let totalConfidence = 0

  for (let col = 0; col < idLength; col++) {
    let bestDigit = '0'
    let bestFillRatio = 0

    // Check each digit (0-9) in this column
    for (let digit = 0; digit <= 9; digit++) {
      const bubbleX = TEMPLATE.studentIdStartX + (col * TEMPLATE.bubbleSpacingX)
      const bubbleY = TEMPLATE.studentIdStartY + (digit * TEMPLATE.bubbleSpacingY)

      const fillRatio = getRegionDarkness(
        pixelData,
        width,
        bubbleX,
        bubbleY,
        TEMPLATE.bubbleWidth,
        TEMPLATE.bubbleHeight
      )

      if (fillRatio > bestFillRatio) {
        bestFillRatio = fillRatio
        bestDigit = digit.toString()
      }
    }

    // Accept if above threshold
    if (bestFillRatio >= threshold) {
      digits.push(bestDigit)
      totalConfidence += Math.min(bestFillRatio * 150, 100)  // Scale to 0-100
    } else {
      // Try to detect anyway if close to threshold
      if (bestFillRatio >= threshold * 0.6) {
        digits.push(bestDigit)
        totalConfidence += 50  // Medium confidence
      } else {
        digits.push('0')
        totalConfidence += 20  // Low confidence
      }
    }
  }

  return {
    student_id: digits.join(''),
    confidence: Math.round(totalConfidence / idLength)
  }
}

/**
 * Extract answers from bubble grid
 */
function extractAnswers(
  pixelData: Buffer,
  width: number,
  height: number,
  numQuestions: number,
  threshold: number
): {
  question_number: number
  detected_answers: string[]
  confidence: number
  filled_percentage: number
}[] {
  const answers: {
    question_number: number
    detected_answers: string[]
    confidence: number
    filled_percentage: number
  }[] = []

  const options = ['A', 'B', 'C', 'D', 'E']
  const questionsPerColumn = 25

  for (let q = 0; q < numQuestions; q++) {
    // Calculate position (questions arranged in columns of 25)
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn

    const detectedAnswers: string[] = []
    const fillRatios: number[] = []
    let maxFillRatio = 0

    // Check each option (A-E)
    for (let opt = 0; opt < 5; opt++) {
      const bubbleX = TEMPLATE.answersStartX + 
                      (col * (5 * TEMPLATE.bubbleSpacingX + 50)) +  // Column offset
                      (opt * TEMPLATE.bubbleSpacingX)
      const bubbleY = TEMPLATE.answersStartY + (row * TEMPLATE.bubbleSpacingY)

      const fillRatio = getRegionDarkness(
        pixelData,
        width,
        bubbleX,
        bubbleY,
        TEMPLATE.bubbleWidth,
        TEMPLATE.bubbleHeight
      )

      fillRatios.push(fillRatio)

      if (fillRatio >= threshold) {
        detectedAnswers.push(options[opt])
        if (fillRatio > maxFillRatio) {
          maxFillRatio = fillRatio
        }
      }
    }

    // If no answer clearly detected, pick the best one if close to threshold
    if (detectedAnswers.length === 0) {
      const maxRatio = Math.max(...fillRatios)
      if (maxRatio >= threshold * 0.6) {
        const maxIndex = fillRatios.indexOf(maxRatio)
        detectedAnswers.push(options[maxIndex])
        maxFillRatio = maxRatio
      }
    }

    answers.push({
      question_number: q + 1,
      detected_answers: detectedAnswers,
      confidence: Math.round(maxFillRatio * 150),  // Scale confidence
      filled_percentage: Math.round(maxFillRatio * 100)
    })
  }

  return answers
}

/**
 * Calculate how "dark" a region is (ratio of dark pixels)
 * Used for bubble detection
 */
function getRegionDarkness(
  pixelData: Buffer,
  imageWidth: number,
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number
): number {
  let darkPixels = 0
  let totalPixels = 0

  // Round coordinates
  const startX = Math.floor(x)
  const startY = Math.floor(y)

  for (let py = startY; py < startY + regionHeight; py++) {
    for (let px = startX; px < startX + regionWidth; px++) {
      // Bounds check
      if (px >= 0 && px < imageWidth && py >= 0) {
        const pixelIndex = py * imageWidth + px
        
        if (pixelIndex >= 0 && pixelIndex < pixelData.length) {
          const value = pixelData[pixelIndex]
          
          // Grayscale: 0 = black, 255 = white
          // Consider pixels below 100 as "dark" (filled)
          if (value < 100) {
            darkPixels++
          }
          totalPixels++
        }
      }
    }
  }

  return totalPixels > 0 ? darkPixels / totalPixels : 0
}

/**
 * Get a debug visualization (for testing)
 */
export async function getDebugImage(
  imageData: Buffer | ArrayBuffer,
  numQuestions: number,
  studentIdLength: number = 10
): Promise<Buffer> {
  const buffer = imageData instanceof ArrayBuffer 
    ? Buffer.from(imageData) 
    : imageData

  // Return the processed grayscale image for debugging
  return sharp(buffer)
    .resize(TEMPLATE.width, TEMPLATE.height, { fit: 'fill' })
    .grayscale()
    .normalize()
    .png()
    .toBuffer()
}
