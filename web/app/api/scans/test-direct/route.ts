import { NextRequest, NextResponse } from 'next/server'
import { processWithSharp } from '@/lib/sharp-omr-processor'

/**
 * POST /api/scans/test-direct
 * 
 * Test endpoint that processes an image directly without authentication.
 * For development/testing purposes only.
 * 
 * Accepts: Base64 image data in JSON body
 * Returns: Full OMR result with debug information
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      image_base64,
      num_questions = 10, 
      student_id_length = 10, 
      bubble_threshold = 0.35,
    } = body

    if (!image_base64) {
      return NextResponse.json(
        { error: 'Missing required field: image_base64' },
        { status: 400 }
      )
    }

    // Convert base64 to buffer
    // Handle data URL format (data:image/png;base64,...)
    let base64Data = image_base64
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1]
    }
    
    const imageBuffer = Buffer.from(base64Data, 'base64')
    
    console.log(`[Test Direct] Processing image: ${imageBuffer.length} bytes`)
    console.log(`[Test Direct] Questions: ${num_questions}, ID Length: ${student_id_length}, Threshold: ${bubble_threshold}`)

    // Convert threshold if needed
    let threshold = bubble_threshold
    if (threshold > 1) {
      threshold = threshold / 100
    }

    // Process with Sharp OMR (always enable debug)
    const result = await processWithSharp(
      imageBuffer,
      num_questions,
      student_id_length,
      threshold,
      true  // Always debug
    )

    console.log(`[Test Direct] Result - Success: ${result.success}, Confidence: ${result.confidence}%`)
    console.log(`[Test Direct] Student ID: ${result.student_id.student_id} (${result.student_id.confidence}% conf)`)
    console.log(`[Test Direct] Answers: ${result.answers.map(a => a.detected_answers.join(',')).join(' | ')}`)

    return NextResponse.json({
      success: result.success,
      confidence: result.confidence,
      student_id: result.student_id,
      answers: result.answers,
      metadata: {
        ...result.metadata,
        test_mode: true,
        num_questions,
        student_id_length,
        bubble_threshold: threshold,
      },
      error: result.error,
    })

  } catch (error) {
    console.error('[Test Direct] Error:', error)
    return NextResponse.json(
      { 
        error: 'Processing failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}
