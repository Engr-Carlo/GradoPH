import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

// Import OpenCV.js - we'll load it dynamically
declare const cv: any

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get request body
    const { exam_id, image_path, bubble_threshold } = await req.json()

    if (!exam_id || !image_path) {
      throw new Error('Missing required parameters: exam_id, image_path')
    }

    console.log(`Processing scan for exam ${exam_id}, threshold: ${bubble_threshold || 50}`)

    // Download image from storage
    const { data: imageData, error: downloadError } = await supabaseClient.storage
      .from('scan-images')
      .download(image_path)

    if (downloadError) {
      throw new Error(`Failed to download image: ${downloadError.message}`)
    }

    // Convert blob to buffer
    const arrayBuffer = await imageData.arrayBuffer()
    const imageBuffer = new Uint8Array(arrayBuffer)

    // Get exam details
    const { data: exam, error: examError } = await supabaseClient
      .from('exams')
      .select('num_questions, exam_code_hash, class_id')
      .eq('id', exam_id)
      .single()

    if (examError || !exam) {
      throw new Error(`Exam not found: ${examError?.message}`)
    }

    // Process the OMR image
    const result = await processOMRImage(imageBuffer, {
      num_questions: exam.num_questions,
      student_id_length: 5,
      bubble_threshold: bubble_threshold || 50,
    })

    // Validate exam hash if present
    if (result.metadata?.exam_code_hash && exam.exam_code_hash) {
      if (result.metadata.exam_code_hash !== exam.exam_code_hash) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Wrong exam sheet detected',
            expected_hash: exam.exam_code_hash,
            detected_hash: result.metadata.exam_code_hash,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            status: 400,
          }
        )
      }
    }

    // Save scan result to database
    const { data: scanRecord, error: insertError } = await supabaseClient
      .from('scans')
      .insert({
        exam_id,
        student_id: result.student_id,
        answers: result.answers,
        score: result.score,
        confidence: result.confidence,
        image_path,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to save scan:', insertError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error: any) {
    console.error('Error processing scan:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Processing failed',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 500,
      }
    )
  }
})

// OMR Processing Functions (from web/lib/omr-processor.ts)
interface OMRConfig {
  num_questions: number
  student_id_length: number
  bubble_threshold?: number
}

interface OMRResult {
  student_id: string
  answers: number[]
  score: number
  total_questions: number
  confidence: number
  metadata?: {
    exam_code_hash?: number
    bubble_threshold?: number
  }
}

async function processOMRImage(
  imageBuffer: Uint8Array,
  config: OMRConfig
): Promise<OMRResult> {
  // Load OpenCV.js if not already loaded
  if (typeof cv === 'undefined') {
    await loadOpenCV()
  }

  // Decode image
  const mat = cv.imdecode(imageBuffer, cv.IMREAD_COLOR)
  const gray = new cv.Mat()
  cv.cvtColor(mat, gray, cv.COLOR_BGR2GRAY)

  // Apply binary threshold
  const binary = new cv.Mat()
  cv.adaptiveThreshold(
    gray,
    binary,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    11,
    2
  )

  // Decode custom barcode
  const barcodeData = decodeCustomBarcode(binary, cv)

  // Extract student ID from bubbles
  const studentId = extractStudentID(binary, cv, config.student_id_length, config.bubble_threshold || 50)

  // Extract answers
  const answers = extractAnswers(binary, cv, config.num_questions, config.bubble_threshold || 50)

  // Calculate score (would need answer key from database)
  const score = Math.floor(Math.random() * config.num_questions) // Placeholder

  // Calculate confidence
  const confidence = 85 // Placeholder - calculate from detection quality

  // Cleanup
  mat.delete()
  gray.delete()
  binary.delete()

  return {
    student_id: studentId,
    answers,
    score,
    total_questions: config.num_questions,
    confidence,
    metadata: {
      exam_code_hash: barcodeData?.exam_code_hash,
      bubble_threshold: config.bubble_threshold || 50,
    },
  }
}

function decodeCustomBarcode(binary: any, cv: any) {
  try {
    const x = 65
    const yTop = 700
    const barWidth = 20
    const barHeight = 8
    const barGap = 6
    const totalBars = 32

    let binaryString = ''

    for (let i = 0; i < totalBars; i++) {
      const y = yTop + i * (barHeight + barGap)
      
      const roi = binary.roi(new cv.Rect(x, y, barWidth, barHeight))
      const whitePixels = cv.countNonZero(roi)
      const totalPixels = barWidth * barHeight
      const fillPercentage = (whitePixels / totalPixels) * 100

      binaryString += fillPercentage > 50 ? '1' : '0'
      roi.delete()
    }

    // Decode BCD (4 bits per digit)
    let examCode = ''
    for (let i = 0; i < 8; i++) {
      const nibble = binaryString.substr(i * 4, 4)
      const digit = parseInt(nibble, 2)
      examCode += digit
    }

    const examHash = parseInt(examCode)

    return {
      exam_code_hash: examHash,
      raw_code: examCode,
      confidence: 95,
    }
  } catch (error) {
    console.error('Barcode decode error:', error)
    return null
  }
}

function extractStudentID(binary: any, cv: any, length: number, bubbleThreshold: number): string {
  try {
    const startX = 650
    const startY = 700
    const digitSpacing = 22
    const bubbleRadius = 8
    const rowHeight = 23

    let studentId = ''

    for (let digitIndex = 0; digitIndex < length; digitIndex++) {
      const x = startX + digitIndex * digitSpacing
      let maxFill = 0
      let detectedDigit = 0

      for (let digit = 0; digit < 10; digit++) {
        const y = startY + digit * rowHeight

        const roi = binary.roi(
          new cv.Rect(
            Math.max(0, x - bubbleRadius),
            Math.max(0, y - bubbleRadius),
            bubbleRadius * 2,
            bubbleRadius * 2
          )
        )

        const whitePixels = cv.countNonZero(roi)
        const totalPixels = (bubbleRadius * 2) * (bubbleRadius * 2)
        const fillPercentage = (whitePixels / totalPixels) * 100

        if (fillPercentage > maxFill) {
          maxFill = fillPercentage
          detectedDigit = digit
        }

        roi.delete()
      }

      studentId += detectedDigit.toString()
    }

    return studentId
  } catch (error) {
    console.error('Student ID extraction error:', error)
    return '00000'
  }
}

function extractAnswers(binary: any, cv: any, numQuestions: number, bubbleThreshold: number): number[] {
  try {
    const startX = 100
    const startY = 200
    const questionSpacing = 30
    const choiceSpacing = 25
    const bubbleRadius = 10
    const numChoices = 4

    const answers: number[] = []

    for (let q = 0; q < numQuestions; q++) {
      const y = startY + q * questionSpacing
      let maxFill = 0
      let selectedChoice = 0

      for (let choice = 0; choice < numChoices; choice++) {
        const x = startX + choice * choiceSpacing

        const roi = binary.roi(
          new cv.Rect(
            Math.max(0, x - bubbleRadius),
            Math.max(0, y - bubbleRadius),
            bubbleRadius * 2,
            bubbleRadius * 2
          )
        )

        const whitePixels = cv.countNonZero(roi)
        const totalPixels = (bubbleRadius * 2) * (bubbleRadius * 2)
        const fillPercentage = (whitePixels / totalPixels) * 100

        if (fillPercentage > maxFill) {
          maxFill = fillPercentage
          selectedChoice = choice
        }

        roi.delete()
      }

      answers.push(selectedChoice + 1) // 1-indexed (A=1, B=2, C=3, D=4)
    }

    return answers
  } catch (error) {
    console.error('Answer extraction error:', error)
    return Array(numQuestions).fill(0)
  }
}

async function loadOpenCV(): Promise<void> {
  // In Deno, we need to load OpenCV.js differently
  // For now, this is a placeholder - you'll need to bundle OpenCV.js
  // or use a Deno-compatible computer vision library
  console.log('OpenCV loading...')
  
  // TODO: Load OpenCV.js for Deno environment
  // This might require using a different approach or library
}
