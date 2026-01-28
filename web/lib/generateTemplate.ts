/**
 * Template Generator - FIXED LAYOUT
 * 
 * This generator creates templates with FIXED positions that match the OMR processor exactly.
 * All coordinates are aligned with sharp-omr-processor.ts for reliable scanning.
 * 
 * IMPORTANT: These coordinates MUST match sharp-omr-processor.ts TEMPLATE constants
 * 
 * Layout specifications:
 * - Canvas size: 850 x 1100 pixels
 * - Corner markers: 40px inset, 22x22px
 * - Student ID: starts at (110, 250), 10 columns x 10 rows
 * - Answers: starts at (460, 250), 4 options (A-D), 25 questions per column
 * - Bubble size: 18x18px, spacing: 25x30px
 */

import QRCode from 'qrcode'
import jsPDF from 'jspdf'

// Fixed template layout - MUST match sharp-omr-processor.ts exactly
export const TEMPLATE_CONFIG = {
  width: 850,
  height: 1100,
  
  // Corner markers
  cornerMarkerInset: 40,
  cornerMarkerSize: 22,
  
  // Student ID grid position (left side)
  studentIdStartX: 110,
  studentIdStartY: 250,
  studentIdDigits: 10,
  
  // Answer grid position (right side)  
  answersStartX: 460,
  answersStartY: 250,
  
  // Bubble dimensions - CRITICAL for OMR alignment
  bubbleWidth: 18,
  bubbleHeight: 18,
  bubbleSpacingX: 25,
  bubbleSpacingY: 30,
  
  // 4 options (A-D) and 25 questions per column
  options: ['A', 'B', 'C', 'D'] as const,
  questionsPerColumn: 25,
  columnGap: 50,
}

export interface TemplateData {
  exam_id: string
  exam_name: string
  class_name: string
  exam_date: string
  student_id_length: number
  num_questions?: number  // defaults to 50
  show_grid?: boolean     // debug grid overlay
}

/**
 * Generate bubble sheet as both PNG and PDF
 */
export async function generateBubbleSheetPDF(data: TemplateData): Promise<{ png: string; pdf: string }> {
  const numQuestions = Math.min(data.num_questions || 50, 100)
  const idLength = Math.min(data.student_id_length || 10, 10)
  const showGrid = Boolean(data.show_grid)
  
  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.width = TEMPLATE_CONFIG.width
  canvas.height = TEMPLATE_CONFIG.height
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, TEMPLATE_CONFIG.width, TEMPLATE_CONFIG.height)
  ctx.fillStyle = '#000000'
  
  // Optional debug grid
  if (showGrid) {
    drawDebugGrid(ctx)
  }
  
  // Draw all template elements
  drawCornerMarkers(ctx)
  drawTitle(ctx, data)
  drawStudentIdSection(ctx, idLength)
  drawAnswerSection(ctx, numQuestions)
  await drawExamInfo(ctx, data, numQuestions)
  drawInstructions(ctx)
  
  // Generate PNG
  const pngDataUrl = canvas.toDataURL('image/png')
  
  // Generate PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [TEMPLATE_CONFIG.width, TEMPLATE_CONFIG.height]
  })
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, TEMPLATE_CONFIG.width, TEMPLATE_CONFIG.height)
  const pdfDataUrl = pdf.output('dataurlstring')
  
  return { png: pngDataUrl, pdf: pdfDataUrl }
}

/**
 * Generate as canvas data URL for preview
 */
export function generateBubbleSheetCanvas(data: TemplateData): string {
  const numQuestions = Math.min(data.num_questions || 50, 100)
  const idLength = Math.min(data.student_id_length || 10, 10)
  
  const canvas = document.createElement('canvas')
  canvas.width = TEMPLATE_CONFIG.width
  canvas.height = TEMPLATE_CONFIG.height
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, TEMPLATE_CONFIG.width, TEMPLATE_CONFIG.height)
  ctx.fillStyle = '#000000'
  
  drawCornerMarkers(ctx)
  drawTitle(ctx, data)
  drawStudentIdSection(ctx, idLength)
  drawAnswerSection(ctx, numQuestions)
  drawInstructions(ctx)
  
  return canvas.toDataURL('image/png')
}

// ===== Drawing Functions =====

function drawDebugGrid(ctx: CanvasRenderingContext2D) {
  const { width, height } = TEMPLATE_CONFIG
  
  ctx.save()
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 0.5
  
  // Draw grid lines every 50px
  for (let x = 0; x <= width; x += 50) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += 50) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  
  // Label key coordinates
  ctx.fillStyle = '#999'
  ctx.font = '10px Arial'
  ctx.fillText(`Student ID: (${TEMPLATE_CONFIG.studentIdStartX}, ${TEMPLATE_CONFIG.studentIdStartY})`, TEMPLATE_CONFIG.studentIdStartX, TEMPLATE_CONFIG.studentIdStartY - 35)
  ctx.fillText(`Answers: (${TEMPLATE_CONFIG.answersStartX}, ${TEMPLATE_CONFIG.answersStartY})`, TEMPLATE_CONFIG.answersStartX, TEMPLATE_CONFIG.answersStartY - 35)
  
  ctx.restore()
}

function drawCornerMarkers(ctx: CanvasRenderingContext2D) {
  const { width, height, cornerMarkerInset: inset, cornerMarkerSize: size } = TEMPLATE_CONFIG
  
  const corners = [
    { x: inset, y: inset },                           // Top-left
    { x: width - inset - size, y: inset },            // Top-right
    { x: inset, y: height - inset - size },           // Bottom-left
    { x: width - inset - size, y: height - inset - size }, // Bottom-right
  ]
  
  corners.forEach(corner => {
    // Black outer square
    ctx.fillStyle = '#000000'
    ctx.fillRect(corner.x, corner.y, size, size)
    
    // White inner square
    ctx.fillStyle = '#FFFFFF'
    const innerOffset = Math.floor(size * 0.27)
    const innerSize = Math.floor(size * 0.46)
    ctx.fillRect(corner.x + innerOffset, corner.y + innerOffset, innerSize, innerSize)
    
    // Black center dot
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(corner.x + size / 2, corner.y + size / 2, size * 0.12, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawTitle(ctx: CanvasRenderingContext2D, data: TemplateData) {
  const { width } = TEMPLATE_CONFIG
  
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 24px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(data.exam_name, width / 2, 100)
  
  ctx.font = '14px Arial'
  ctx.fillText(`${data.class_name} | ${data.exam_date}`, width / 2, 125)
  
  // Header boxes for name, student number, year/section
  drawHeaderBoxes(ctx, data)
}

function drawHeaderBoxes(ctx: CanvasRenderingContext2D, data: TemplateData) {
  const startY = 150
  const boxHeight = 30
  const labelGap = 12
  
  ctx.font = 'bold 11px Arial'
  ctx.textAlign = 'left'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  
  // Name box
  ctx.fillText('Name:', 80, startY)
  ctx.strokeRect(80, startY + 5, 250, boxHeight)
  
  // Student Number box (write-in)
  ctx.fillText('Student No:', 350, startY)
  ctx.strokeRect(350, startY + 5, 150, boxHeight)
  
  // Date box
  ctx.fillText('Date:', 520, startY)
  ctx.strokeRect(520, startY + 5, 120, boxHeight)
  
  // Year/Section box
  ctx.fillText('Year & Section:', 660, startY)
  ctx.strokeRect(660, startY + 5, 130, boxHeight)
}

function drawStudentIdSection(ctx: CanvasRenderingContext2D, idLength: number) {
  const { 
    studentIdStartX, studentIdStartY, 
    bubbleWidth, bubbleHeight, 
    bubbleSpacingX, bubbleSpacingY 
  } = TEMPLATE_CONFIG
  
  // Section label
  ctx.font = 'bold 14px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('STUDENT ID', studentIdStartX, studentIdStartY - 25)
  
  // Column headers (1, 2, 3, ...)
  ctx.font = '10px Arial'
  ctx.textAlign = 'center'
  for (let col = 0; col < idLength; col++) {
    const x = studentIdStartX + col * bubbleSpacingX + bubbleWidth / 2
    ctx.fillText(`${col + 1}`, x, studentIdStartY - 8)
  }
  
  // Row labels (0-9) and bubbles
  ctx.textAlign = 'right'
  for (let digit = 0; digit <= 9; digit++) {
    const y = studentIdStartY + digit * bubbleSpacingY + bubbleHeight / 2
    
    // Row label
    ctx.font = '10px Arial'
    ctx.fillText(`${digit}`, studentIdStartX - 8, y + 4)
    
    // Bubbles for this row
    for (let col = 0; col < idLength; col++) {
      const bubbleX = studentIdStartX + col * bubbleSpacingX + bubbleWidth / 2
      
      ctx.beginPath()
      ctx.ellipse(bubbleX, y, bubbleWidth / 2 - 1, bubbleHeight / 2 - 1, 0, 0, Math.PI * 2)
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
  }
  
  // Border around section
  const sectionWidth = idLength * bubbleSpacingX + 15
  const sectionHeight = 10 * bubbleSpacingY + 20
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1.5
  ctx.strokeRect(
    studentIdStartX - 15,
    studentIdStartY - 30,
    sectionWidth,
    sectionHeight
  )
}

function drawAnswerSection(ctx: CanvasRenderingContext2D, numQuestions: number) {
  const { 
    answersStartX, answersStartY,
    bubbleWidth, bubbleHeight,
    bubbleSpacingX, bubbleSpacingY,
    questionsPerColumn, options, columnGap
  } = TEMPLATE_CONFIG
  
  // Section label
  ctx.font = 'bold 14px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('ANSWERS', answersStartX, answersStartY - 25)
  
  const numColumns = Math.ceil(numQuestions / questionsPerColumn)
  
  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn
    
    // Calculate position
    // Each column: 4 options * 25px spacing + 50px gap = 150px per column
    const colOffset = col * (options.length * bubbleSpacingX + columnGap)
    const qStartX = answersStartX + colOffset
    const qStartY = answersStartY + row * bubbleSpacingY
    
    // Question number
    ctx.font = '9px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.fillText(`${q + 1}.`, qStartX - 5, qStartY + bubbleHeight / 2 + 3)
    
    // Option bubbles (A, B, C, D)
    for (let opt = 0; opt < options.length; opt++) {
      const bubbleX = qStartX + opt * bubbleSpacingX + bubbleWidth / 2
      const bubbleY = qStartY + bubbleHeight / 2
      
      ctx.beginPath()
      ctx.ellipse(bubbleX, bubbleY, bubbleWidth / 2 - 1, bubbleHeight / 2 - 1, 0, 0, Math.PI * 2)
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    
    // Option headers (A, B, C, D) for first row of each column
    if (row === 0) {
      ctx.font = '8px Arial'
      ctx.textAlign = 'center'
      options.forEach((opt, i) => {
        ctx.fillText(opt, qStartX + i * bubbleSpacingX + bubbleWidth / 2, qStartY - 5)
      })
    }
  }
}

async function drawExamInfo(ctx: CanvasRenderingContext2D, data: TemplateData, numQuestions: number) {
  const infoX = 60
  const infoY = TEMPLATE_CONFIG.height - 120
  
  // Exam info text
  ctx.font = '11px Arial'
  ctx.fillStyle = '#555555'
  ctx.textAlign = 'left'
  ctx.fillText(`Exam ID: ${data.exam_id}`, infoX, infoY)
  ctx.fillText(`Questions: ${numQuestions}`, infoX, infoY + 16)
  
  // QR Code with exam data
  try {
    const qrData = JSON.stringify({
      exam_id: data.exam_id,
      name: data.exam_name,
      questions: numQuestions,
    })
    
    const qrCanvas = await QRCode.toCanvas(qrData, { 
      width: 80, 
      margin: 1,
      errorCorrectionLevel: 'M'
    })
    
    ctx.drawImage(qrCanvas, infoX, infoY + 25, 80, 80)
    
    // Labels next to QR
    ctx.font = '10px Arial'
    ctx.fillStyle = '#666666'
    ctx.fillText(data.exam_name, infoX + 90, infoY + 50)
    ctx.fillText(data.class_name, infoX + 90, infoY + 65)
    ctx.fillText(data.exam_date, infoX + 90, infoY + 80)
  } catch (e) {
    console.error('QR generation failed:', e)
  }
}

function drawInstructions(ctx: CanvasRenderingContext2D) {
  const { width, height } = TEMPLATE_CONFIG
  const y = height - 25
  
  ctx.font = '9px Arial'
  ctx.fillStyle = '#888888'
  ctx.textAlign = 'center'
  ctx.fillText('Instructions: Use #2 pencil. Fill bubbles completely. Erase cleanly.', width / 2, y)
  ctx.fillText('DO NOT fold or crease. Print at 100% scale.', width / 2, y + 12)
}
