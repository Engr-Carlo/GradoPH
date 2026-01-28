import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processWithSharp } from '@/lib/sharp-omr-processor'

/**
 * POST /api/scans/test
 * Test endpoint for OMR scanner diagnostics
 * Returns detailed debug information about the scan
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    )

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      image_path, 
      num_questions = 10, 
      student_id_length = 10, 
      bubble_threshold = 0.35,
      debug = false 
    } = body

    if (!image_path) {
      return NextResponse.json(
        { error: 'Missing required field: image_path' },
        { status: 400 }
      )
    }

    // Download image from storage
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('scan-images')
      .download(image_path)

    if (downloadError || !imageData) {
      return NextResponse.json(
        { error: 'Failed to download image', details: downloadError?.message },
        { status: 500 }
      )
    }

    // Convert threshold: if passed as integer percentage (e.g., 35), convert to decimal (0.35)
    let threshold = bubble_threshold || 0.35
    if (threshold > 1) {
      threshold = threshold / 100
    }

    console.log(`[Test Scan] Processing image: ${image_path}`)
    console.log(`[Test Scan] Questions: ${num_questions}, ID Length: ${student_id_length}, Threshold: ${threshold}`)

    // Process with Sharp OMR (always enable debug in test mode)
    const imageBuffer = await imageData.arrayBuffer()
    const result = await processWithSharp(
      Buffer.from(imageBuffer),
      num_questions,
      student_id_length,
      threshold,
      true  // Always debug in test mode
    )

    console.log(`[Test Scan] Result - Success: ${result.success}, Confidence: ${result.confidence}%`)
    console.log(`[Test Scan] Student ID: ${result.student_id.student_id} (${result.student_id.confidence}% conf)`)

    // Return full result for diagnostic purposes
    return NextResponse.json({
      success: result.success,
      confidence: result.confidence,
      student_id: result.student_id,
      answers: result.answers,
      metadata: {
        ...result.metadata,
        test_mode: true,
        image_path,
        num_questions,
        student_id_length,
        bubble_threshold,
      },
      error: result.error,
    })

  } catch (error) {
    console.error('[Test Scan] Error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}
