/**
 * Fixed Layout Template Generator
 * 
 * Creates templates with FIXED positions that match the OMR processor exactly.
 * Use this for reliable scanning. The original generateTemplate.ts uses
 * dynamic positioning which causes alignment issues.
 * 
 * IMPORTANT: These coordinates MUST match sharp-omr-processor.ts
 */

import jsPDF from 'jspdf'
import QRCode from 'qrcode'

// Fixed template layout - MUST match OMR processor exactly
export const FIXED_TEMPLATE = {
  width: 850,
  height: 1100,
  cornerMarkerInset: 40,
  cornerMarkerSize: 22,
  
  // Student ID grid position
  studentIdStartX: 110,
  studentIdStartY: 250,
  studentIdDigits: 10,
  
  // Answer grid position
  answersStartX: 460,
  answersStartY: 250,
  
  // Bubble dimensions
  bubbleWidth: 18,
  bubbleHeight: 18,
  bubbleSpacingX: 25,
  bubbleSpacingY: 30,
  
  // 4 options (A-D) and 25 questions per column
  options: ['A', 'B', 'C', 'D'] as const,
  questionsPerColumn: 25,
  columnGap: 50,
}

export interface FixedTemplateData {
  exam_id: string
  exam_name: string
  class_name: string
  exam_date: string
  student_id_length?: number  // Defaults to 10
  num_questions: number       // Up to 100 (4 columns x 25)
  exam_code_hash?: number
}

/**
 * Generate a bubble sheet with fixed layout matching OMR processor
 */
export async function generateFixedBubbleSheetPDF(data: FixedTemplateData): Promise<void> {
  const numQuestions = Math.min(data.num_questions, 100)
  const idLength = Math.min(data.student_id_length || 10, 10)
  
  // Create PDF - Letter size
  const widthMM = 215.9
  const heightMM = 279.4
  const scaleX = widthMM / FIXED_TEMPLATE.width
  const scaleY = heightMM / FIXED_TEMPLATE.height
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  })
  
  // Draw all elements
  drawTitle(doc, data, widthMM)
  drawCornerMarkers(doc, scaleX, scaleY)
  drawStudentIdSection(doc, idLength, scaleX, scaleY)
  drawAnswerSection(doc, numQuestions, scaleX, scaleY)
  await drawExamInfo(doc, data, scaleX, scaleY)
  drawInstructions(doc, widthMM, heightMM)
  
  // Save
  doc.save(`exam-${data.exam_name.replace(/\s+/g, '-')}.pdf`)
}

/**
 * Generate as canvas/image for preview or direct upload
 */
export function generateFixedBubbleSheetCanvas(data: FixedTemplateData): string {
  const numQuestions = Math.min(data.num_questions, 100)
  const idLength = Math.min(data.student_id_length || 10, 10)
  
  const canvas = document.createElement('canvas')
  canvas.width = FIXED_TEMPLATE.width
  canvas.height = FIXED_TEMPLATE.height
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, FIXED_TEMPLATE.width, FIXED_TEMPLATE.height)
  
  // Draw elements
  drawCornerMarkersCanvas(ctx)
  drawTitleCanvas(ctx, data)
  drawStudentIdCanvas(ctx, idLength)
  drawAnswersCanvas(ctx, numQuestions)
  drawExamInfoCanvas(ctx, data)
  
  return canvas.toDataURL('image/png')
}

// ===== PDF Drawing Functions =====

function drawTitle(doc: jsPDF, data: FixedTemplateData, widthMM: number) {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(data.exam_name, widthMM / 2, 15, { align: 'center' })
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`${data.class_name} | ${data.exam_date}`, widthMM / 2, 22, { align: 'center' })
}

function drawCornerMarkers(doc: jsPDF, scaleX: number, scaleY: number) {
  const { cornerMarkerInset: inset, cornerMarkerSize: size, width, height } = FIXED_TEMPLATE
  
  const corners = [
    { x: inset, y: inset },
    { x: width - inset - size, y: inset },
    { x: inset, y: height - inset - size },
    { x: width - inset - size, y: height - inset - size },
  ]
  
  corners.forEach(corner => {
    const x = corner.x * scaleX
    const y = corner.y * scaleY
    const w = size * scaleX
    const h = size * scaleY
    
    // Black outer
    doc.setFillColor(0, 0, 0)
    doc.rect(x, y, w, h, 'F')
    
    // White inner
    doc.setFillColor(255, 255, 255)
    doc.rect(x + w * 0.27, y + h * 0.27, w * 0.46, h * 0.46, 'F')
    
    // Black center
    doc.setFillColor(0, 0, 0)
    doc.circle(x + w / 2, y + h / 2, w * 0.12, 'F')
  })
}

function drawStudentIdSection(doc: jsPDF, idLength: number, scaleX: number, scaleY: number) {
  const { studentIdStartX, studentIdStartY, bubbleWidth, bubbleHeight, bubbleSpacingX, bubbleSpacingY } = FIXED_TEMPLATE
  
  const startX = studentIdStartX * scaleX
  const startY = studentIdStartY * scaleY
  const bW = bubbleWidth * scaleX
  const bH = bubbleHeight * scaleY
  const spX = bubbleSpacingX * scaleX
  const spY = bubbleSpacingY * scaleY
  
  // Label
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('STUDENT ID', startX, startY - 10)
  
  // Column headers
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  for (let col = 0; col < idLength; col++) {
    doc.text(`${col + 1}`, startX + col * spX + bW / 2, startY - 3, { align: 'center' })
  }
  
  // Row labels (0-9)
  for (let digit = 0; digit <= 9; digit++) {
    doc.text(`${digit}`, startX - 4, startY + digit * spY + bH / 2 + 1, { align: 'right' })
  }
  
  // Bubbles
  for (let col = 0; col < idLength; col++) {
    for (let digit = 0; digit <= 9; digit++) {
      const x = startX + col * spX + bW / 2
      const y = startY + digit * spY + bH / 2
      
      doc.setDrawColor(80, 80, 80)
      doc.setLineWidth(0.3)
      doc.ellipse(x, y, bW / 2 - 0.5, bH / 2 - 0.5, 'S')
    }
  }
  
  // Border around section
  const borderPadding = 5
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.rect(
    startX - borderPadding,
    startY - 15,
    idLength * spX + borderPadding * 2,
    10 * spY + 20,
    'S'
  )
}

function drawAnswerSection(doc: jsPDF, numQuestions: number, scaleX: number, scaleY: number) {
  const { answersStartX, answersStartY, bubbleWidth, bubbleHeight, bubbleSpacingX, bubbleSpacingY, questionsPerColumn, options, columnGap } = FIXED_TEMPLATE
  
  const startX = answersStartX * scaleX
  const startY = answersStartY * scaleY
  const bW = bubbleWidth * scaleX
  const bH = bubbleHeight * scaleY
  const spX = bubbleSpacingX * scaleX
  const spY = bubbleSpacingY * scaleY
  const colGapMM = columnGap * scaleX // Convert column gap to mm
  
  // Label
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('ANSWERS', startX, startY - 10)
  
  // Draw questions
  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn
    
    // 4 options per column + gap
    const colOffset = col * (4 * spX + colGapMM)
    const qStartX = startX + colOffset
    const qStartY = startY + row * spY
    
    // Question number
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`${q + 1}.`, qStartX - 4, qStartY + bH / 2 + 1, { align: 'right' })
    
    // Option bubbles (4 options: A-D)
    for (let opt = 0; opt < 4; opt++) {
      const x = qStartX + opt * spX + bW / 2
      const y = qStartY + bH / 2
      
      doc.setDrawColor(80, 80, 80)
      doc.setLineWidth(0.3)
      doc.ellipse(x, y, bW / 2 - 0.5, bH / 2 - 0.5, 'S')
    }
    
    // Option headers for first row of each column
    if (row === 0) {
      doc.setFontSize(6)
      options.forEach((opt, i) => {
        doc.text(opt, qStartX + i * spX + bW / 2, qStartY - 2, { align: 'center' })
      })
    }
  }
}

async function drawExamInfo(doc: jsPDF, data: FixedTemplateData, scaleX: number, scaleY: number) {
  // Draw exam info box at bottom left
  const infoX = 15
  const infoY = 250 // mm from top
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Exam: ${data.exam_name}`, infoX, infoY)
  doc.text(`Class: ${data.class_name}`, infoX, infoY + 4)
  doc.text(`Date: ${data.exam_date}`, infoX, infoY + 8)
  doc.text(`Questions: ${data.num_questions}`, infoX, infoY + 12)
  
  // QR Code
  if (data.exam_id) {
    try {
      const qrData = JSON.stringify({
        exam_id: data.exam_id,
        hash: data.exam_code_hash || 0,
      })
      const qrDataUrl = await QRCode.toDataURL(qrData, { width: 80, margin: 1 })
      doc.addImage(qrDataUrl, 'PNG', infoX, infoY + 16, 20, 20)
    } catch (e) {
      console.error('QR generation failed:', e)
    }
  }
}

function drawInstructions(doc: jsPDF, widthMM: number, heightMM: number) {
  const y = heightMM - 15
  
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('Instructions: Use #2 pencil. Fill bubbles completely. Erase cleanly if changing answers.', widthMM / 2, y, { align: 'center' })
  doc.text('DO NOT fold or crease this sheet. Print at 100% scale.', widthMM / 2, y + 4, { align: 'center' })
  doc.setTextColor(0, 0, 0)
}

// ===== Canvas Drawing Functions =====

function drawCornerMarkersCanvas(ctx: CanvasRenderingContext2D) {
  const { cornerMarkerInset: inset, cornerMarkerSize: size, width, height } = FIXED_TEMPLATE
  
  const corners = [
    { x: inset, y: inset },
    { x: width - inset - size, y: inset },
    { x: inset, y: height - inset - size },
    { x: width - inset - size, y: height - inset - size },
  ]
  
  corners.forEach(corner => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(corner.x, corner.y, size, size)
    
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(corner.x + size * 0.27, corner.y + size * 0.27, size * 0.46, size * 0.46)
    
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(corner.x + size / 2, corner.y + size / 2, size * 0.12, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawTitleCanvas(ctx: CanvasRenderingContext2D, data: FixedTemplateData) {
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 28px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(data.exam_name, FIXED_TEMPLATE.width / 2, 50)
  
  ctx.font = '16px Arial'
  ctx.fillText(`${data.class_name} | ${data.exam_date}`, FIXED_TEMPLATE.width / 2, 75)
}

function drawStudentIdCanvas(ctx: CanvasRenderingContext2D, idLength: number) {
  const { studentIdStartX, studentIdStartY, bubbleWidth, bubbleHeight, bubbleSpacingX, bubbleSpacingY } = FIXED_TEMPLATE
  
  // Label
  ctx.font = 'bold 16px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('STUDENT ID', studentIdStartX, studentIdStartY - 20)
  
  // Column headers
  ctx.font = '11px Arial'
  ctx.textAlign = 'center'
  for (let col = 0; col < idLength; col++) {
    ctx.fillText(`${col + 1}`, studentIdStartX + col * bubbleSpacingX + bubbleWidth / 2, studentIdStartY - 5)
  }
  
  // Row labels
  ctx.textAlign = 'right'
  for (let digit = 0; digit <= 9; digit++) {
    ctx.fillText(`${digit}`, studentIdStartX - 8, studentIdStartY + digit * bubbleSpacingY + bubbleHeight / 2 + 4)
  }
  
  // Bubbles
  for (let col = 0; col < idLength; col++) {
    for (let digit = 0; digit <= 9; digit++) {
      const x = studentIdStartX + col * bubbleSpacingX + bubbleWidth / 2
      const y = studentIdStartY + digit * bubbleSpacingY + bubbleHeight / 2
      
      ctx.beginPath()
      ctx.ellipse(x, y, bubbleWidth / 2 - 1, bubbleHeight / 2 - 1, 0, 0, Math.PI * 2)
      ctx.strokeStyle = '#555555'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
}

function drawAnswersCanvas(ctx: CanvasRenderingContext2D, numQuestions: number) {
  const { answersStartX, answersStartY, bubbleWidth, bubbleHeight, bubbleSpacingX, bubbleSpacingY, questionsPerColumn, options } = FIXED_TEMPLATE
  const columnGap = 50
  
  // Label
  ctx.font = 'bold 16px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('ANSWERS', answersStartX, answersStartY - 20)
  
  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / questionsPerColumn)
    const row = q % questionsPerColumn
    
    // 4 options per column + gap
    const colOffset = col * (4 * bubbleSpacingX + columnGap)
    const qStartX = answersStartX + colOffset
    const qStartY = answersStartY + row * bubbleSpacingY
    
    // Question number
    ctx.font = '10px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.fillText(`${q + 1}.`, qStartX - 5, qStartY + bubbleHeight / 2 + 4)
    
    // Option bubbles (4 options: A-D)
    for (let opt = 0; opt < 4; opt++) {
      const x = qStartX + opt * bubbleSpacingX + bubbleWidth / 2
      const y = qStartY + bubbleHeight / 2
      
      ctx.beginPath()
      ctx.ellipse(x, y, bubbleWidth / 2 - 1, bubbleHeight / 2 - 1, 0, 0, Math.PI * 2)
      ctx.strokeStyle = '#555555'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    
    // Option headers for first row of each column
    if (row === 0) {
      ctx.font = '9px Arial'
      ctx.textAlign = 'center'
      options.forEach((opt, i) => {
        ctx.fillText(opt, qStartX + i * bubbleSpacingX + bubbleWidth / 2, qStartY - 5)
      })
    }
  }
}

function drawExamInfoCanvas(ctx: CanvasRenderingContext2D, data: FixedTemplateData) {
  const infoX = 50
  const infoY = FIXED_TEMPLATE.height - 100
  
  ctx.font = '12px Arial'
  ctx.fillStyle = '#666666'
  ctx.textAlign = 'left'
  ctx.fillText(`Exam: ${data.exam_name}`, infoX, infoY)
  ctx.fillText(`Class: ${data.class_name}`, infoX, infoY + 18)
  ctx.fillText(`Date: ${data.exam_date}`, infoX, infoY + 36)
  ctx.fillText(`Questions: ${data.num_questions}`, infoX, infoY + 54)
}
