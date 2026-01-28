/**
 * Template Generator - FIXED LAYOUT v2
 * 
 * Professional OMR bubble sheet with proper layout:
 * - QR code in header area (top-right)
 * - Compact Student ID section
 * - Answer bubbles fit within page margins
 * - Clean professional appearance
 * 
 * Canvas size: 850 x 1100 pixels (letter size proportions)
 * Safe margins: 60px from each edge
 */

import QRCode from 'qrcode'
import jsPDF from 'jspdf'

// Fixed template layout - MUST match sharp-omr-processor.ts exactly
export const TEMPLATE_CONFIG = {
  width: 850,
  height: 1100,
  
  // Safe margins
  marginLeft: 60,
  marginRight: 60,
  marginTop: 40,
  marginBottom: 40,
  
  // Corner markers for alignment detection
  cornerMarkerInset: 40,
  cornerMarkerSize: 20,
  
  // Student ID grid position (left side, below header)
  studentIdStartX: 80,
  studentIdStartY: 200,
  studentIdDigits: 10,
  
  // Answer grid position (right of student ID)
  answersStartX: 380,
  answersStartY: 200,
  
  // Bubble dimensions - smaller for compact layout
  bubbleWidth: 16,
  bubbleHeight: 16,
  bubbleSpacingX: 22,
  bubbleSpacingY: 26,
  
  // 4 options (A-D), 25 questions per column, max 2 columns
  options: ['A', 'B', 'C', 'D'] as const,
  questionsPerColumn: 25,
  columnGap: 40,
}

export interface TemplateData {
  exam_id: string
  exam_name: string
  class_name: string
  exam_date: string
  student_id_length: number
  num_questions?: number
  show_grid?: boolean
}

/**
 * Generate bubble sheet as both PNG and PDF
 */
export async function generateBubbleSheetPDF(data: TemplateData): Promise<{ png: string; pdf: string }> {
  const numQuestions = Math.min(data.num_questions || 50, 50) // Max 50 questions (2 columns x 25)
  const idLength = Math.min(data.student_id_length || 10, 10)
  const showGrid = Boolean(data.show_grid)
  
  const canvas = document.createElement('canvas')
  canvas.width = TEMPLATE_CONFIG.width
  canvas.height = TEMPLATE_CONFIG.height
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, TEMPLATE_CONFIG.width, TEMPLATE_CONFIG.height)
  
  // Optional debug grid
  if (showGrid) {
    drawDebugGrid(ctx)
  }
  
  // Draw all elements
  drawCornerMarkers(ctx)
  await drawHeader(ctx, data)
  drawStudentIdSection(ctx, idLength)
  drawAnswerSection(ctx, numQuestions)
  drawFooter(ctx)
  
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

// ===== Drawing Functions =====

function drawDebugGrid(ctx: CanvasRenderingContext2D) {
  const { width, height, marginLeft, marginRight, marginTop, marginBottom } = TEMPLATE_CONFIG
  
  ctx.save()
  ctx.strokeStyle = '#ddd'
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
  
  // Draw safe area
  ctx.strokeStyle = '#f00'
  ctx.lineWidth = 1
  ctx.strokeRect(marginLeft, marginTop, width - marginLeft - marginRight, height - marginTop - marginBottom)
  
  ctx.restore()
}

function drawCornerMarkers(ctx: CanvasRenderingContext2D) {
  const { width, height, cornerMarkerInset: inset, cornerMarkerSize: size } = TEMPLATE_CONFIG
  
  const corners = [
    { x: inset, y: inset },
    { x: width - inset - size, y: inset },
    { x: inset, y: height - inset - size },
    { x: width - inset - size, y: height - inset - size },
  ]
  
  corners.forEach(corner => {
    // Black outer square
    ctx.fillStyle = '#000000'
    ctx.fillRect(corner.x, corner.y, size, size)
    
    // White inner square
    ctx.fillStyle = '#FFFFFF'
    const innerOffset = Math.floor(size * 0.25)
    const innerSize = Math.floor(size * 0.5)
    ctx.fillRect(corner.x + innerOffset, corner.y + innerOffset, innerSize, innerSize)
    
    // Black center dot
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(corner.x + size / 2, corner.y + size / 2, 2, 0, Math.PI * 2)
    ctx.fill()
  })
}

async function drawHeader(ctx: CanvasRenderingContext2D, data: TemplateData) {
  const { width, marginLeft, marginRight } = TEMPLATE_CONFIG
  const headerY = 70
  
  // QR Code (top-right, integrated into header)
  try {
    const qrData = JSON.stringify({
      id: data.exam_id,
      n: data.exam_name.substring(0, 20),
    })
    const qrCanvas = await QRCode.toCanvas(qrData, { 
      width: 70, 
      margin: 1,
      errorCorrectionLevel: 'L'
    })
    ctx.drawImage(qrCanvas, width - marginRight - 75, 65, 70, 70)
  } catch (e) {
    console.error('QR generation failed:', e)
  }
  
  // Title (left-aligned, next to QR)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 22px Arial'
  ctx.textAlign = 'left'
  ctx.fillText(data.exam_name, marginLeft, headerY)
  
  ctx.font = '13px Arial'
  ctx.fillStyle = '#444444'
  ctx.fillText(`${data.class_name} | ${data.exam_date}`, marginLeft, headerY + 20)
  
  // Horizontal line below header
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(marginLeft, 150)
  ctx.lineTo(width - marginRight, 150)
  ctx.stroke()
  
  // Write-in fields row
  const fieldY = 165
  ctx.fillStyle = '#000000'
  ctx.font = '10px Arial'
  ctx.textAlign = 'left'
  
  // Name field
  ctx.fillText('NAME:', marginLeft, fieldY)
  ctx.strokeStyle = '#888888'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(marginLeft + 40, fieldY + 2)
  ctx.lineTo(marginLeft + 250, fieldY + 2)
  ctx.stroke()
  
  // Section field
  ctx.fillText('SECTION:', marginLeft + 270, fieldY)
  ctx.beginPath()
  ctx.moveTo(marginLeft + 330, fieldY + 2)
  ctx.lineTo(marginLeft + 450, fieldY + 2)
  ctx.stroke()
  
  // Date field
  ctx.fillText('DATE:', marginLeft + 480, fieldY)
  ctx.beginPath()
  ctx.moveTo(marginLeft + 515, fieldY + 2)
  ctx.lineTo(width - marginRight - 80, fieldY + 2)
  ctx.stroke()
}

function drawStudentIdSection(ctx: CanvasRenderingContext2D, idLength: number) {
  const { 
    studentIdStartX: startX, 
    studentIdStartY: startY, 
    bubbleWidth, 
    bubbleHeight, 
    bubbleSpacingX, 
    bubbleSpacingY 
  } = TEMPLATE_CONFIG
  
  // Section label
  ctx.font = 'bold 11px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('STUDENT ID', startX, startY - 15)
  
  // Compact bubble size for student ID
  const idBubbleW = 14
  const idBubbleH = 14
  const idSpacingX = 18
  const idSpacingY = 20
  
  // Column headers (1, 2, 3, ...)
  ctx.font = '8px Arial'
  ctx.textAlign = 'center'
  for (let col = 0; col < idLength; col++) {
    const x = startX + col * idSpacingX + idBubbleW / 2
    ctx.fillText(`${col + 1}`, x, startY - 3)
  }
  
  // Row labels (0-9) and bubbles
  for (let digit = 0; digit <= 9; digit++) {
    const y = startY + digit * idSpacingY + idBubbleH / 2
    
    // Row label
    ctx.font = '8px Arial'
    ctx.textAlign = 'right'
    ctx.fillText(`${digit}`, startX - 5, y + 3)
    
    // Bubbles
    for (let col = 0; col < idLength; col++) {
      const bubbleX = startX + col * idSpacingX + idBubbleW / 2
      
      ctx.beginPath()
      ctx.ellipse(bubbleX, y, idBubbleW / 2 - 1, idBubbleH / 2 - 1, 0, 0, Math.PI * 2)
      ctx.strokeStyle = '#444444'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  
  // Light border around section
  const sectionWidth = idLength * idSpacingX + 10
  const sectionHeight = 10 * idSpacingY + 15
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 0.5
  ctx.strokeRect(startX - 12, startY - 20, sectionWidth, sectionHeight)
}

function drawAnswerSection(ctx: CanvasRenderingContext2D, numQuestions: number) {
  const { 
    answersStartX: startX, 
    answersStartY: startY,
    bubbleWidth,
    bubbleHeight,
    bubbleSpacingX,
    bubbleSpacingY,
    questionsPerColumn,
    options,
    columnGap,
    width,
    marginRight
  } = TEMPLATE_CONFIG
  
  // Section label
  ctx.font = 'bold 11px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('ANSWERS', startX, startY - 15)
  
  const numColumns = Math.ceil(numQuestions / questionsPerColumn)
  
  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn
    
    // Column offset: 4 options * spacing + gap
    const colOffset = col * (options.length * bubbleSpacingX + columnGap)
    const qStartX = startX + colOffset
    const qStartY = startY + row * bubbleSpacingY
    
    // Question number
    ctx.font = '9px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    const qNumWidth = q + 1 >= 10 ? 18 : 12
    ctx.fillText(`${q + 1}.`, qStartX - 3, qStartY + bubbleHeight / 2 + 3)
    
    // Option bubbles (A, B, C, D)
    for (let opt = 0; opt < options.length; opt++) {
      const bubbleX = qStartX + opt * bubbleSpacingX + bubbleWidth / 2
      const bubbleY = qStartY + bubbleHeight / 2
      
      ctx.beginPath()
      ctx.ellipse(bubbleX, bubbleY, bubbleWidth / 2 - 1, bubbleHeight / 2 - 1, 0, 0, Math.PI * 2)
      ctx.strokeStyle = '#444444'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    
    // Option labels for first row of each column
    if (row === 0) {
      ctx.font = '8px Arial'
      ctx.textAlign = 'center'
      options.forEach((opt, i) => {
        ctx.fillText(opt, qStartX + i * bubbleSpacingX + bubbleWidth / 2, qStartY - 5)
      })
    }
  }
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  const { width, height, marginLeft, marginRight, marginBottom } = TEMPLATE_CONFIG
  const footerY = height - marginBottom - 10
  
  ctx.font = '8px Arial'
  ctx.fillStyle = '#888888'
  ctx.textAlign = 'center'
  ctx.fillText('Use #2 pencil. Fill bubbles completely. Erase cleanly.', width / 2, footerY)
  ctx.fillText('DO NOT fold or crease. Print at 100% scale.', width / 2, footerY + 12)
}
