/**
 * OMR (Optical Mark Recognition) Processor using Jimp
 * 
 * Pure JavaScript image processing - no native modules.
 * Works perfectly on Vercel serverless functions.
 * 
 * Template specifications:
 * - Image size: 850 x 1100 pixels
 * - Corner markers: 40px inset from edges
 * - Student ID: 10 columns of digits (0-9)
 * - Answers: 5 options per question (A-E)
 */

import { Jimp } from 'jimp'

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

export interface JimpOMRResult {
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
  }
  error?: string
}

/**
 * Main OMR processing function using Jimp
 */
export async function processWithJimp(
  imageData: Buffer | ArrayBuffer | Blob,
  numQuestions: number,
  studentIdLength: number = 10,
  bubbleThreshold: number = 0.35  // 35% filled = marked
): Promise<JimpOMRResult> {
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

    // Load image with Jimp
    const image = await Jimp.read(buffer)
    const originalWidth = image.getWidth()
    const originalHeight = image.getHeight()

    console.log(`Processing image: ${originalWidth}x${originalHeight}`)

    // Resize to template size and convert to grayscale
    image
      .resize(TEMPLATE.width, TEMPLATE.height)
      .grayscale()
      .contrast(0.2)  // Improve contrast

    // Extract student ID
    const studentIdResult = extractStudentId(
      image,
      studentIdLength,
      bubbleThreshold
    )

    // Extract answers
    const answersResult = extractAnswers(
      image,
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
        processing_mode: 'jimp-omr',
        image_dimensions: { 
          width: originalWidth, 
          height: originalHeight 
        }
      }
    }
  } catch (error) {
    console.error('Jimp OMR Processing error:', error)

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
  image: Jimp,
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

      const fillRatio = getBubbleFillRatio(
        image,
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
      totalConfidence += Math.min(bestFillRatio * 150, 100)
    } else if (bestFillRatio >= threshold * 0.6) {
      digits.push(bestDigit)
      totalConfidence += 50
    } else {
      digits.push('0')
      totalConfidence += 20
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
  image: Jimp,
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
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn

    const detectedAnswers: string[] = []
    const fillRatios: number[] = []
    let maxFillRatio = 0

    // Check each option (A-E)
    for (let opt = 0; opt < 5; opt++) {
      const bubbleX = TEMPLATE.answersStartX + 
                      (col * (5 * TEMPLATE.bubbleSpacingX + 50)) +
                      (opt * TEMPLATE.bubbleSpacingX)
      const bubbleY = TEMPLATE.answersStartY + (row * TEMPLATE.bubbleSpacingY)

      const fillRatio = getBubbleFillRatio(
        image,
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
      confidence: Math.round(maxFillRatio * 150),
      filled_percentage: Math.round(maxFillRatio * 100)
    })
  }

  return answers
}

/**
 * Calculate how "filled" a bubble region is using Jimp
 */
function getBubbleFillRatio(
  image: Jimp,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  let darkPixels = 0
  let totalPixels = 0

  const imgWidth = image.getWidth()
  const imgHeight = image.getHeight()

  // Sample pixels within the bubble region
  for (let py = Math.floor(y); py < Math.floor(y + height); py++) {
    for (let px = Math.floor(x); px < Math.floor(x + width); px++) {
      // Bounds check
      if (px >= 0 && px < imgWidth && py >= 0 && py < imgHeight) {
        try {
          const color = Jimp.intToRGBA(image.getPixelColor(px, py))
          // Grayscale: use red channel (all channels are same after grayscale)
          // Consider pixels below 100 as "dark" (filled)
          if (color.r < 100) {
            darkPixels++
          }
          totalPixels++
        } catch {
          // Ignore pixel read errors
        }
      }
    }
  }

  return totalPixels > 0 ? darkPixels / totalPixels : 0
}
