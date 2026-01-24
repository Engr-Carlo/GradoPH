/**
 * OMR (Optical Mark Recognition) Processor using Sharp
 * 
 * High-performance image processing for bubble sheet scanning.
 * Works on Vercel with Next.js 15.1.11+.
 * 
 * Template specifications:
 * - Image size: 850 x 1100 pixels
 * - Corner markers: 40px inset from edges
 * - Student ID: 10 columns of digits (0-9)
 * - Answers: 5 options per question (A-E)
 */

import sharp from 'sharp'

// Template layout constants
const TEMPLATE = {
  width: 850,
  height: 1100,
  cornerMarkerInset: 40,
  
  // Student ID grid
  studentIdStartX: 110,
  studentIdStartY: 250,
  
  // Answer grid
  answersStartX: 460,
  answersStartY: 250,
  
  // Bubble dimensions
  bubbleWidth: 18,
  bubbleHeight: 18,
  bubbleSpacingX: 25,
  bubbleSpacingY: 30,
}

export interface SharpOMRResult {
  success: boolean
  confidence: number
  student_id: {
    student_id: string
    confidence: number
    debug?: { col: number; digit: number; fillRatio: number }[]
  }
  answers: {
    question_number: number
    detected_answers: string[]
    confidence: number
    filled_percentage: number
    debug?: { option: string; fillRatio: number }[]
  }[]
  metadata: {
    processing_mode: string
    image_dimensions?: { width: number; height: number }
    template_specs?: typeof TEMPLATE
  }
  error?: string
}

/**
 * Main OMR processing function using Sharp
 */
export async function processWithSharp(
  imageData: Buffer | ArrayBuffer | Blob,
  numQuestions: number,
  studentIdLength: number = 10,
  bubbleThreshold: number = 0.35,
  debug: boolean = false
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

    // Get original image metadata
    const metadata = await sharp(buffer).metadata()
    const originalWidth = metadata.width || 0
    const originalHeight = metadata.height || 0

    console.log(`Processing image: ${originalWidth}x${originalHeight}`)

    // Resize to template size and convert to grayscale
    const { data: pixelData, info } = await sharp(buffer)
      .resize(TEMPLATE.width, TEMPLATE.height, { fit: 'fill' })
      .grayscale()
      .normalize()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Extract student ID
    const studentIdResult = extractStudentId(
      pixelData,
      info.width,
      studentIdLength,
      bubbleThreshold,
      debug
    )

    // Extract answers
    const answersResult = extractAnswers(
      pixelData,
      info.width,
      numQuestions,
      bubbleThreshold,
      debug
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
          width: originalWidth, 
          height: originalHeight 
        },
        template_specs: debug ? TEMPLATE : undefined,
      }
    }
  } catch (error) {
    console.error('Sharp OMR Processing error:', error)

    // Return fallback result
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
 * Extract student ID from bubble grid
 */
function extractStudentId(
  pixelData: Buffer,
  width: number,
  idLength: number,
  threshold: number,
  includeDebug: boolean = false
): { student_id: string; confidence: number; debug?: { col: number; digit: number; fillRatio: number }[] } {
  const digits: string[] = []
  let totalConfidence = 0
  const debugData: { col: number; digit: number; fillRatio: number }[] = []

  for (let col = 0; col < idLength; col++) {
    let bestDigit = '0'
    let bestFillRatio = 0

    for (let digit = 0; digit <= 9; digit++) {
      const bubbleX = TEMPLATE.studentIdStartX + (col * TEMPLATE.bubbleSpacingX)
      const bubbleY = TEMPLATE.studentIdStartY + (digit * TEMPLATE.bubbleSpacingY)

      const fillRatio = getBubbleFillRatio(
        pixelData,
        width,
        bubbleX,
        bubbleY,
        TEMPLATE.bubbleWidth,
        TEMPLATE.bubbleHeight
      )

      if (includeDebug) {
        debugData.push({ col, digit, fillRatio: Math.round(fillRatio * 100) / 100 })
      }

      if (fillRatio > bestFillRatio) {
        bestFillRatio = fillRatio
        bestDigit = digit.toString()
      }
    }

    if (bestFillRatio >= threshold) {
      digits.push(bestDigit)
      totalConfidence += Math.min(bestFillRatio * 150, 100)
    } else if (bestFillRatio >= threshold * 0.6) {
      digits.push(bestDigit)
      totalConfidence += 50
    } else {
      digits.push('0')
      totalConfidence += 20
    }
  }

  const result: { student_id: string; confidence: number; debug?: { col: number; digit: number; fillRatio: number }[] } = {
    student_id: digits.join(''),
    confidence: Math.round(totalConfidence / idLength)
  }
  
  if (includeDebug) {
    result.debug = debugData
  }
  
  return result
}

/**
 * Extract answers from bubble grid
 */
function extractAnswers(
  pixelData: Buffer,
  width: number,
  numQuestions: number,
  threshold: number,
  includeDebug: boolean = false
): {
  question_number: number
  detected_answers: string[]
  confidence: number
  filled_percentage: number
  debug?: { option: string; fillRatio: number }[]
}[] {
  const answers: {
    question_number: number
    detected_answers: string[]
    confidence: number
    filled_percentage: number
    debug?: { option: string; fillRatio: number }[]
  }[] = []

  const options = ['A', 'B', 'C', 'D', 'E']
  const questionsPerColumn = 25

  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn

    const detectedAnswers: string[] = []
    const fillRatios: number[] = []
    const debugOptions: { option: string; fillRatio: number }[] = []
    let maxFillRatio = 0

    for (let opt = 0; opt < 5; opt++) {
      const bubbleX = TEMPLATE.answersStartX + 
                      (col * (5 * TEMPLATE.bubbleSpacingX + 50)) +
                      (opt * TEMPLATE.bubbleSpacingX)
      const bubbleY = TEMPLATE.answersStartY + (row * TEMPLATE.bubbleSpacingY)

      const fillRatio = getBubbleFillRatio(
        pixelData,
        width,
        bubbleX,
        bubbleY,
        TEMPLATE.bubbleWidth,
        TEMPLATE.bubbleHeight
      )

      fillRatios.push(fillRatio)
      
      if (includeDebug) {
        debugOptions.push({ option: options[opt], fillRatio: Math.round(fillRatio * 100) / 100 })
      }

      if (fillRatio >= threshold) {
        detectedAnswers.push(options[opt])
        if (fillRatio > maxFillRatio) {
          maxFillRatio = fillRatio
        }
      }
    }

    if (detectedAnswers.length === 0) {
      const maxRatio = Math.max(...fillRatios)
      if (maxRatio >= threshold * 0.6) {
        const maxIndex = fillRatios.indexOf(maxRatio)
        detectedAnswers.push(options[maxIndex])
        maxFillRatio = maxRatio
      }
    }

    const answerResult: typeof answers[0] = {
      question_number: q + 1,
      detected_answers: detectedAnswers,
      confidence: Math.round(maxFillRatio * 150),
      filled_percentage: Math.round(maxFillRatio * 100)
    }
    
    if (includeDebug) {
      answerResult.debug = debugOptions
    }

    answers.push(answerResult)
  }

  return answers
}

/**
 * Calculate bubble fill ratio from raw pixel data
 */
function getBubbleFillRatio(
  pixelData: Buffer,
  width: number,
  x: number,
  y: number,
  bubbleWidth: number,
  bubbleHeight: number
): number {
  let darkPixels = 0
  let totalPixels = 0

  for (let py = Math.floor(y); py < Math.floor(y + bubbleHeight); py++) {
    for (let px = Math.floor(x); px < Math.floor(x + bubbleWidth); px++) {
      const pixelIndex = py * width + px
      if (pixelIndex >= 0 && pixelIndex < pixelData.length) {
        // Grayscale: 0 = black, 255 = white
        if (pixelData[pixelIndex] < 100) {
          darkPixels++
        }
        totalPixels++
      }
    }
  }

  return totalPixels > 0 ? darkPixels / totalPixels : 0
}
