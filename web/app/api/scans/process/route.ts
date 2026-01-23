import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { processWithSharp } from '@/lib/sharp-omr-processor'

/**
 * POST /api/scans/process
 * Process uploaded OMR scan image
 */
export async function POST(request: NextRequest) {
  try {
    // Support both cookie-based auth (web) and Bearer token (mobile)
    const authHeader = request.headers.get('authorization')
    let supabase
    let session

    if (authHeader?.startsWith('Bearer ')) {
      // Mobile app with Bearer token
      const token = authHeader.substring(7)
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      )
      
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        session = { user: data.user }
      }
    } else {
      // Web browser with cookies
      supabase = createRouteHandlerClient({ cookies })
      const { data } = await supabase.auth.getSession()
      session = data.session
    }

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { exam_id, student_id, image_path, bubble_threshold } = body

    if (!exam_id || !image_path) {
      return NextResponse.json(
        { error: 'Missing required fields: exam_id, image_path' },
        { status: 400 }
      )
    }

    // Get exam details with class and school info for student_id_length
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select(`
        id,
        name,
        answer_key_json,
        classes (
          id,
          schools (
            student_id_length
          )
        )
      `)
      .eq('id', exam_id)
      .single()

    if (examError || !exam) {
      console.error('Exam query error:', examError)
      return NextResponse.json({ error: 'Exam not found', details: examError?.message }, { status: 404 })
    }

    // Extract nested values
    const answerKey = exam.answer_key_json as string[] | null
    const numQuestions = answerKey?.length || 0
    const studentIdLength = (exam.classes as any)?.schools?.student_id_length || 10

    // Download image from Supabase Storage
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('scan-images')
      .download(image_path)

    if (downloadError || !imageData) {
      return NextResponse.json(
        { error: 'Failed to download image from storage' },
        { status: 500 }
      )
    }

    console.log('Processing scan for exam:', exam.name, 'Questions:', numQuestions)
    
    // Process the image using Sharp-based OMR processor
    const imageBuffer = await imageData.arrayBuffer()
    const processingResult = await processWithSharp(
      Buffer.from(imageBuffer),
      numQuestions,
      studentIdLength,
      bubble_threshold || 0.35  // Default 35% threshold
    )
    
    // If OMR failed, use provided student_id or generate fallback
    if (!processingResult.success || processingResult.student_id.confidence < 30) {
      console.log('OMR low confidence, using fallback student_id:', student_id)
      if (student_id) {
        processingResult.student_id.student_id = student_id
        processingResult.student_id.confidence = 80  // Manual input
      }
    }
    
    // Add exam metadata to result
    processingResult.metadata = {
      ...processingResult.metadata,
      exam_id: exam.id,
      exam_name: exam.name,
      num_questions: numQuestions
    } as any

    // Calculate score against answer key
    let score = 0
    if (answerKey && Array.isArray(answerKey)) {
      score = processingResult.answers.filter((ans, idx) => 
        ans.detected_answers[0] === answerKey[idx]
      ).length
    }

    // Check if this student has already been scanned for this exam
    const { data: existingScan } = await supabase
      .from('scans')
      .select('id')
      .eq('exam_id', exam.id)
      .eq('student_id', processingResult.student_id.student_id)
      .single()

    if (existingScan) {
      // Update existing scan instead of creating duplicate
      const { data: updatedScan, error: updateError } = await supabase
        .from('scans')
        .update({
          answers_json: processingResult.answers.map(a => a.detected_answers[0] || null),
          confidence: processingResult.confidence,
          image_path: image_path,
          score: score
        })
        .eq('id', existingScan.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating scan:', updateError)
        return NextResponse.json(
          { error: 'Failed to update scan results', details: updateError.message },
          { status: 500 }
        )
      }

      console.log('Scan updated:', updatedScan.id, 'Score:', score, '/', numQuestions)

      return NextResponse.json({
        success: true,
        scan_id: updatedScan.id,
        score: score,
        total_questions: numQuestions,
        confidence: processingResult.confidence,
        student_id: processingResult.student_id.student_id,
        answers: processingResult.answers,
        metadata: processingResult.metadata,
        message: 'Scan updated (student already scanned)'
      })
    }

    // Save new scan to database
    const { data: scan, error: insertError } = await supabase
      .from('scans')
      .insert({
        exam_id: exam.id,
        student_id: processingResult.student_id.student_id,
        answers_json: processingResult.answers.map(a => a.detected_answers[0] || null),
        confidence: processingResult.confidence,
        image_path: image_path,
        scanned_by: session.user.id,
        score: score,
        is_unknown_student: false
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error saving scan:', insertError)
      return NextResponse.json(
        { error: 'Failed to save scan results', details: insertError.message, code: insertError.code },
        { status: 500 }
      )
    }

    console.log('Scan saved successfully:', scan.id, 'Score:', score, '/', numQuestions)

    return NextResponse.json({
      success: true,
      scan_id: scan.id,
      score: score,
      total_questions: numQuestions,
      confidence: processingResult.confidence,
      student_id: processingResult.student_id.student_id,
      answers: processingResult.answers,
      metadata: processingResult.metadata,
      message: 'Scan processed successfully with Sharp OMR'
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper function to generate test student ID
function generateTestStudentId(length: number): string {
  let id = ''
  for (let i = 0; i < length; i++) {
    id += Math.floor(Math.random() * 10).toString()
  }
  return id
}
