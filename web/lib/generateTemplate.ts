/**
 * Professional OMR Bubble Sheet Template Generator
 * 
 * Creates clean, scannable bubble sheets similar to Scantron forms.
 * Supports up to 100 questions (4 columns × 25 rows)
 * 
 * Layout (850 × 1100 pixels - Letter size proportions):
 * ┌─────────────────────────────────────────────────────────┐
 * │ [■]                    HEADER                      [■] │
 * │     Exam Name | Class | Date              [QR CODE]    │
 * │─────────────────────────────────────────────────────────│
 * │  NAME: _________________  SECTION: ______  DATE: ____  │
 * │─────────────────────────────────────────────────────────│
 * │  STUDENT ID                                             │
 * │    1   2   3   4   5   6   7   8   9   10              │
 * │  ⓪ ⓪ ⓪ ⓪ ⓪ ⓪ ⓪ ⓪ ⓪ ⓪                │
 * │  ① ① ① ① ① ① ① ① ① ①                │
 * │  ...                                                    │
 * │─────────────────────────────────────────────────────────│
 * │  ANSWERS                                                │
 * │   1-25        26-50       51-75       76-100           │
 * │  1.ⒶⒷⒸⒹ  26.ⒶⒷⒸⒹ  51.ⒶⒷⒸⒹ  76.ⒶⒷⒸⒹ         │
 * │  ...                                                    │
 * │ [■]                   FOOTER                       [■] │
 * └─────────────────────────────────────────────────────────┘
 */

import QRCode from 'qrcode'
import jsPDF from 'jspdf'

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE CONFIGURATION - These values MUST match sharp-omr-processor.ts
// ═══════════════════════════════════════════════════════════════════════════════

export const TEMPLATE_CONFIG = {
  // Canvas dimensions (Letter size proportions)
  width: 850,
  height: 1100,
  
  // Margins
  margin: 50,
  
  // Corner markers for alignment detection
  cornerMarker: {
    inset: 30,
    size: 24,
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STUDENT ID SECTION
  // Position: Left side, starting at Y=220
  // Layout: 10 columns (positions 1-10) × 10 rows (digits 0-9)
  // ─────────────────────────────────────────────────────────────────────────────
  studentId: {
    startX: 60,
    startY: 220,
    bubbleRadius: 8,
    spacingX: 24,
    spacingY: 22,
    digits: 10,
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // ANSWERS SECTION
  // Position: Below student ID, starting at Y=500
  // Layout: 4 columns × 25 questions each = 100 questions max
  // ─────────────────────────────────────────────────────────────────────────────
  answers: {
    startX: 60,
    startY: 500,
    bubbleRadius: 7,
    spacingX: 20,
    spacingY: 22,
    columnWidth: 200,
    questionsPerColumn: 25,
    options: ['A', 'B', 'C', 'D'] as const,
  },
}

export interface TemplateData {
  exam_id: string
  exam_name: string
  class_name: string
  exam_date: string
  student_id_length?: number
  num_questions?: number
  show_grid?: boolean
}

/**
 * Generate bubble sheet as both PNG and PDF
 */
export async function generateBubbleSheetPDF(data: TemplateData): Promise<{ png: string; pdf: string }> {
  const numQuestions = Math.min(data.num_questions || 50, 100)
  const idLength = Math.min(data.student_id_length || 10, 10)
  const showGrid = Boolean(data.show_grid)
  
  const { width, height } = TEMPLATE_CONFIG
  
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  
  // Optional debug grid
  if (showGrid) {
    drawDebugGrid(ctx)
  }
  
  // Draw template elements
  drawCornerMarkers(ctx)
  await drawHeader(ctx, data)
  drawWriteInFields(ctx)
  drawStudentIdSection(ctx, idLength)
  drawAnswerSection(ctx, numQuestions)
  drawFooter(ctx)
  
  // Generate PNG
  const pngDataUrl = canvas.toDataURL('image/png')
  
  // Generate PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [width, height],
  })
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, width, height)
  const pdfDataUrl = pdf.output('dataurlstring')
  
  return { png: pngDataUrl, pdf: pdfDataUrl }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRAWING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function drawDebugGrid(ctx: CanvasRenderingContext2D) {
  const { width, height } = TEMPLATE_CONFIG
  
  ctx.save()
  ctx.strokeStyle = '#eee'
  ctx.lineWidth = 0.5
  
  for (let x = 0; x <= width; x += 50) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    ctx.fillStyle = '#ccc'
    ctx.font = '8px Arial'
    ctx.fillText(String(x), x + 2, 10)
  }
  
  for (let y = 0; y <= height; y += 50) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    ctx.fillStyle = '#ccc'
    ctx.font = '8px Arial'
    ctx.fillText(String(y), 2, y + 10)
  }
  
  ctx.restore()
}

function drawCornerMarkers(ctx: CanvasRenderingContext2D) {
  const { width, height, cornerMarker } = TEMPLATE_CONFIG
  const { inset, size } = cornerMarker
  
  const positions = [
    { x: inset, y: inset },
    { x: width - inset - size, y: inset },
    { x: inset, y: height - inset - size },
    { x: width - inset - size, y: height - inset - size },
  ]
  
  positions.forEach(pos => {
    // Black outer square
    ctx.fillStyle = '#000000'
    ctx.fillRect(pos.x, pos.y, size, size)
    
    // White inner square
    const innerInset = size * 0.3
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(pos.x + innerInset, pos.y + innerInset, size - innerInset * 2, size - innerInset * 2)
    
    // Black center dot
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(pos.x + size / 2, pos.y + size / 2, size * 0.15, 0, Math.PI * 2)
    ctx.fill()
  })
}

async function drawHeader(ctx: CanvasRenderingContext2D, data: TemplateData) {
  const { width, margin, cornerMarker } = TEMPLATE_CONFIG
  const headerY = 75
  
  // Exam title
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 28px Arial'
  ctx.textAlign = 'left'
  ctx.fillText(data.exam_name, margin, headerY)
  
  // Subtitle
  ctx.font = '14px Arial'
  ctx.fillStyle = '#444444'
  ctx.fillText(`${data.class_name} | ${data.exam_date}`, margin, headerY + 25)
  
  // QR Code
  try {
    const qrSize = 80
    const qrX = width - margin - qrSize
    const qrY = cornerMarker.inset + cornerMarker.size + 10
    
    const qrData = JSON.stringify({ id: data.exam_id, n: data.exam_name.substring(0, 20) })
    const qrCanvas = await QRCode.toCanvas(qrData, { 
      width: qrSize, 
      margin: 1,
      errorCorrectionLevel: 'M',
    })
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize)
  } catch (e) {
    console.error('QR generation failed:', e)
  }
  
  // Separator line
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(margin, 115)
  ctx.lineTo(width - margin, 115)
  ctx.stroke()
}

function drawWriteInFields(ctx: CanvasRenderingContext2D) {
  const { width, margin } = TEMPLATE_CONFIG
  const y = 145
  
  ctx.font = '12px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  
  // NAME
  ctx.fillText('NAME:', margin, y)
  ctx.strokeStyle = '#666666'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(margin + 50, y + 3)
  ctx.lineTo(margin + 280, y + 3)
  ctx.stroke()
  
  // SECTION
  ctx.fillText('SECTION:', margin + 310, y)
  ctx.beginPath()
  ctx.moveTo(margin + 380, y + 3)
  ctx.lineTo(margin + 500, y + 3)
  ctx.stroke()
  
  // DATE
  ctx.fillText('DATE:', margin + 530, y)
  ctx.beginPath()
  ctx.moveTo(margin + 575, y + 3)
  ctx.lineTo(width - margin, y + 3)
  ctx.stroke()
}

function drawStudentIdSection(ctx: CanvasRenderingContext2D, idLength: number) {
  const { studentId } = TEMPLATE_CONFIG
  const { startX, startY, bubbleRadius, spacingX, spacingY } = studentId
  
  // Section title
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('STUDENT ID', startX, startY - 30)
  
  // Column headers
  ctx.font = 'bold 10px Arial'
  ctx.textAlign = 'center'
  for (let col = 0; col < idLength; col++) {
    const x = startX + col * spacingX + bubbleRadius
    ctx.fillText(String(col + 1), x, startY - 10)
  }
  
  // Bubble grid
  for (let digit = 0; digit <= 9; digit++) {
    const y = startY + digit * spacingY + bubbleRadius
    
    // Row label
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.fillText(String(digit), startX - 8, y + 4)
    
    // Bubbles
    for (let col = 0; col < idLength; col++) {
      const x = startX + col * spacingX + bubbleRadius
      drawBubble(ctx, x, y, bubbleRadius)
    }
  }
  
  // Border
  const sectionWidth = idLength * spacingX + 20
  const sectionHeight = 10 * spacingY + 30
  ctx.strokeStyle = '#999999'
  ctx.lineWidth = 1
  ctx.strokeRect(startX - 15, startY - 45, sectionWidth, sectionHeight)
}

function drawAnswerSection(ctx: CanvasRenderingContext2D, numQuestions: number) {
  const { answers, width, margin } = TEMPLATE_CONFIG
  const { startX, startY, bubbleRadius, spacingX, spacingY, columnWidth, questionsPerColumn, options } = answers
  
  // Section title
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('ANSWERS - Fill in the bubble completely using #2 pencil', startX, startY - 30)
  
  // Separator
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(startX, startY - 15)
  ctx.lineTo(width - margin, startY - 15)
  ctx.stroke()
  
  const numColumns = Math.ceil(numQuestions / questionsPerColumn)
  
  // Column headers
  ctx.font = 'bold 10px Arial'
  ctx.textAlign = 'center'
  
  for (let col = 0; col < numColumns; col++) {
    const colStartX = startX + col * columnWidth + 25
    
    // Range label
    const startQ = col * questionsPerColumn + 1
    const endQ = Math.min((col + 1) * questionsPerColumn, numQuestions)
    ctx.fillStyle = '#666666'
    ctx.font = '10px Arial'
    ctx.fillText(`${startQ}-${endQ}`, colStartX + (options.length * spacingX) / 2, startY - 5)
    
    // Option labels
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 9px Arial'
    for (let opt = 0; opt < options.length; opt++) {
      ctx.fillText(options[opt], colStartX + opt * spacingX, startY + 10)
    }
  }
  
  // Questions
  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn
    
    const qStartX = startX + col * columnWidth
    const qStartY = startY + 20 + row * spacingY
    
    // Question number
    ctx.font = '10px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.fillText(`${q + 1}.`, qStartX + 20, qStartY + bubbleRadius + 4)
    
    // Bubbles
    for (let opt = 0; opt < options.length; opt++) {
      const x = qStartX + 25 + opt * spacingX + bubbleRadius
      const y = qStartY + bubbleRadius
      drawBubble(ctx, x, y, bubbleRadius)
    }
  }
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, filled: boolean = false) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  
  if (filled) {
    ctx.fillStyle = '#000000'
    ctx.fill()
  } else {
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 1.2
    ctx.stroke()
  }
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  const { width, height, margin } = TEMPLATE_CONFIG
  const footerY = height - 40
  
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(margin, footerY - 15)
  ctx.lineTo(width - margin, footerY - 15)
  ctx.stroke()
  
  ctx.font = '10px Arial'
  ctx.fillStyle = '#666666'
  ctx.textAlign = 'center'
  ctx.fillText('Use #2 pencil only. Fill bubbles completely. Erase cleanly. Do not fold or crease.', width / 2, footerY)
  ctx.fillText('Print at 100% scale for accurate scanning.', width / 2, footerY + 14)
}
