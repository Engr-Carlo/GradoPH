/**
 * Test Template Generator
 * 
 * Creates a diagnostic template that EXACTLY matches the OMR processor's 
 * expected positions. Used to verify scanner accuracy.
 * 
 * IMPORTANT: These coordinates MUST match sharp-omr-processor.ts
 */

import jsPDF from 'jspdf'

// These MUST match the OMR processor constants exactly
export const OMR_TEMPLATE = {
  width: 850,
  height: 1100,
  cornerMarkerInset: 40,
  
  // Student ID grid - matches OMR processor
  studentIdStartX: 110,
  studentIdStartY: 250,
  
  // Answer grid - matches OMR processor  
  answersStartX: 460,
  answersStartY: 250,
  
  // Bubble dimensions - matches OMR processor
  bubbleWidth: 18,
  bubbleHeight: 18,
  bubbleSpacingX: 25,
  bubbleSpacingY: 30,
  
  // Options
  options: ['A', 'B', 'C', 'D', 'E'] as const,
  questionsPerColumn: 25,
}

export interface TestTemplateConfig {
  studentId: string       // e.g., "1234567890"
  answers: string[]       // e.g., ["A", "B", "C", "D", "A", ...]
  numQuestions: number    // e.g., 10
  fillBubbles: boolean    // Whether to fill the correct bubbles
  showDebugGrid: boolean  // Show position grid for debugging
}

/**
 * Generate a diagnostic test template as downloadable PDF
 */
export async function generateTestTemplatePDF(config: TestTemplateConfig): Promise<void> {
  const { studentId, answers, numQuestions, fillBubbles, showDebugGrid } = config
  
  // Letter size in mm
  const widthMM = 215.9  // 8.5 inches
  const heightMM = 279.4 // 11 inches
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  })
  
  // Scale factor from template pixels to mm
  const scaleX = widthMM / OMR_TEMPLATE.width
  const scaleY = heightMM / OMR_TEMPLATE.height
  
  // Draw title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('OMR SCANNER TEST TEMPLATE', widthMM / 2, 15, { align: 'center' })
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Print at 100% scale - Do not resize', widthMM / 2, 22, { align: 'center' })
  doc.text(`Expected Student ID: ${studentId}`, widthMM / 2, 28, { align: 'center' })
  doc.text(`Expected Answers: ${answers.slice(0, 10).join(', ')}${answers.length > 10 ? '...' : ''}`, widthMM / 2, 34, { align: 'center' })
  
  // Draw corner markers
  drawCornerMarkers(doc, scaleX, scaleY)
  
  // Draw Student ID section
  drawStudentIdSection(doc, studentId, fillBubbles, scaleX, scaleY)
  
  // Draw Answer section
  drawAnswerSection(doc, answers, numQuestions, fillBubbles, scaleX, scaleY)
  
  // Draw debug grid if requested
  if (showDebugGrid) {
    drawDebugGrid(doc, widthMM, heightMM, scaleX, scaleY)
  }
  
  // Draw legend
  drawLegend(doc, widthMM, heightMM, fillBubbles, studentId, answers)
  
  // Save
  doc.save(`test-template-${studentId}.pdf`)
}

function drawCornerMarkers(doc: jsPDF, scaleX: number, scaleY: number) {
  const inset = OMR_TEMPLATE.cornerMarkerInset
  const size = 22
  
  const corners = [
    { x: inset, y: inset },
    { x: OMR_TEMPLATE.width - inset - size, y: inset },
    { x: inset, y: OMR_TEMPLATE.height - inset - size },
    { x: OMR_TEMPLATE.width - inset - size, y: OMR_TEMPLATE.height - inset - size },
  ]
  
  corners.forEach(corner => {
    const x = corner.x * scaleX
    const y = corner.y * scaleY
    const w = size * scaleX
    const h = size * scaleY
    
    // Black outer square
    doc.setFillColor(0, 0, 0)
    doc.rect(x, y, w, h, 'F')
    
    // White inner square
    doc.setFillColor(255, 255, 255)
    doc.rect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5, 'F')
    
    // Black center dot
    doc.setFillColor(0, 0, 0)
    doc.circle(x + w / 2, y + h / 2, w * 0.15, 'F')
  })
}

function drawStudentIdSection(
  doc: jsPDF,
  studentId: string,
  fillBubbles: boolean,
  scaleX: number,
  scaleY: number
) {
  const startX = OMR_TEMPLATE.studentIdStartX * scaleX
  const startY = OMR_TEMPLATE.studentIdStartY * scaleY
  const bubbleW = OMR_TEMPLATE.bubbleWidth * scaleX
  const bubbleH = OMR_TEMPLATE.bubbleHeight * scaleY
  const spacingX = OMR_TEMPLATE.bubbleSpacingX * scaleX
  const spacingY = OMR_TEMPLATE.bubbleSpacingY * scaleY
  
  // Section label
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('STUDENT ID', startX, startY - 12)
  
  // Draw column headers
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  for (let col = 0; col < 10; col++) {
    const x = startX + col * spacingX + bubbleW / 2
    doc.text(`${col + 1}`, x, startY - 4, { align: 'center' })
  }
  
  // Draw row labels (0-9)
  for (let digit = 0; digit <= 9; digit++) {
    const y = startY + digit * spacingY + bubbleH / 2 + 1
    doc.text(`${digit}`, startX - 4, y, { align: 'right' })
  }
  
  // Draw bubbles
  for (let col = 0; col < 10; col++) {
    for (let digit = 0; digit <= 9; digit++) {
      const x = startX + col * spacingX + bubbleW / 2
      const y = startY + digit * spacingY + bubbleH / 2
      
      // Pad studentId to 10 digits
      const paddedId = studentId.padStart(10, '0')
      const expectedDigit = parseInt(paddedId[col] || '0', 10)
      const shouldFill = fillBubbles && digit === expectedDigit
      
      if (shouldFill) {
        doc.setFillColor(0, 0, 0)
        doc.ellipse(x, y, bubbleW / 2 - 0.5, bubbleH / 2 - 0.5, 'F')
      } else {
        doc.setDrawColor(100, 100, 100)
        doc.setLineWidth(0.3)
        doc.ellipse(x, y, bubbleW / 2 - 0.5, bubbleH / 2 - 0.5, 'S')
      }
    }
  }
}

function drawAnswerSection(
  doc: jsPDF,
  answers: string[],
  numQuestions: number,
  fillBubbles: boolean,
  scaleX: number,
  scaleY: number
) {
  const startX = OMR_TEMPLATE.answersStartX * scaleX
  const startY = OMR_TEMPLATE.answersStartY * scaleY
  const bubbleW = OMR_TEMPLATE.bubbleWidth * scaleX
  const bubbleH = OMR_TEMPLATE.bubbleHeight * scaleY
  const spacingX = OMR_TEMPLATE.bubbleSpacingX * scaleX
  const spacingY = OMR_TEMPLATE.bubbleSpacingY * scaleY
  const qPerCol = OMR_TEMPLATE.questionsPerColumn
  
  // Section label
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('ANSWERS', startX, startY - 12)
  
  // Draw option headers (A-E)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  OMR_TEMPLATE.options.forEach((opt, i) => {
    const x = startX + i * spacingX + bubbleW / 2
    doc.text(opt, x, startY - 4, { align: 'center' })
  })
  
  // Draw questions
  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / qPerCol)
    const row = q % qPerCol
    
    // Column offset (each column has 5 bubbles + gap)
    const columnOffset = col * (5 * spacingX + 15)
    const qStartX = startX + columnOffset
    const qStartY = startY + row * spacingY
    
    // Draw question number
    doc.setFontSize(7)
    doc.text(`${q + 1}.`, qStartX - 5, qStartY + bubbleH / 2 + 1, { align: 'right' })
    
    // Draw option bubbles
    for (let opt = 0; opt < 5; opt++) {
      const x = qStartX + opt * spacingX + bubbleW / 2
      const y = qStartY + bubbleH / 2
      
      const expectedAnswer = answers[q] || ''
      const optionLetter = OMR_TEMPLATE.options[opt]
      const shouldFill = fillBubbles && optionLetter === expectedAnswer
      
      if (shouldFill) {
        doc.setFillColor(0, 0, 0)
        doc.ellipse(x, y, bubbleW / 2 - 0.5, bubbleH / 2 - 0.5, 'F')
      } else {
        doc.setDrawColor(100, 100, 100)
        doc.setLineWidth(0.3)
        doc.ellipse(x, y, bubbleW / 2 - 0.5, bubbleH / 2 - 0.5, 'S')
      }
    }
  }
}

function drawDebugGrid(
  doc: jsPDF,
  widthMM: number,
  heightMM: number,
  scaleX: number,
  scaleY: number
) {
  doc.setDrawColor(255, 0, 0)
  doc.setLineWidth(0.1)
  doc.setFontSize(5)
  doc.setTextColor(255, 0, 0)
  
  // Draw grid lines every 100 pixels
  for (let x = 0; x <= OMR_TEMPLATE.width; x += 100) {
    const xMM = x * scaleX
    doc.line(xMM, 0, xMM, heightMM)
    doc.text(`${x}`, xMM + 1, 8)
  }
  
  for (let y = 100; y <= OMR_TEMPLATE.height; y += 100) {
    const yMM = y * scaleY
    doc.line(0, yMM, widthMM, yMM)
    doc.text(`${y}`, 2, yMM - 1)
  }
  
  // Mark key positions
  doc.setFillColor(0, 200, 0)
  doc.circle(OMR_TEMPLATE.studentIdStartX * scaleX, OMR_TEMPLATE.studentIdStartY * scaleY, 1.5, 'F')
  
  doc.setFillColor(0, 0, 200)
  doc.circle(OMR_TEMPLATE.answersStartX * scaleX, OMR_TEMPLATE.answersStartY * scaleY, 1.5, 'F')
  
  doc.setTextColor(0, 0, 0)
}

function drawLegend(
  doc: jsPDF,
  widthMM: number,
  heightMM: number,
  fillBubbles: boolean,
  studentId: string,
  answers: string[]
) {
  const y = heightMM - 35
  
  doc.setFillColor(240, 240, 240)
  doc.rect(10, y - 5, widthMM - 20, 32, 'F')
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('VERIFICATION DATA (for scanner testing)', 15, y)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Student ID: ${studentId.padStart(10, '0')}`, 15, y + 6)
  doc.text(`Answers: ${answers.join(', ')}`, 15, y + 12)
  doc.text(`Bubbles: ${fillBubbles ? 'PRE-FILLED (scanner should detect these)' : 'EMPTY (fill manually before scanning)'}`, 15, y + 18)
  
  doc.setFontSize(6)
  doc.setTextColor(100, 100, 100)
  doc.text(`Template: ${OMR_TEMPLATE.width}x${OMR_TEMPLATE.height}px | ID@(${OMR_TEMPLATE.studentIdStartX},${OMR_TEMPLATE.studentIdStartY}) | Ans@(${OMR_TEMPLATE.answersStartX},${OMR_TEMPLATE.answersStartY})`, 
    widthMM / 2, y + 24, { align: 'center' })
}

/**
 * Generate test template as Canvas/Image data URL
 * For displaying in browser or direct upload testing
 */
export function generateTestTemplateCanvas(config: TestTemplateConfig): string {
  const canvas = document.createElement('canvas')
  canvas.width = OMR_TEMPLATE.width
  canvas.height = OMR_TEMPLATE.height
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, OMR_TEMPLATE.width, OMR_TEMPLATE.height)
  
  // Draw corner markers
  drawCornerMarkersCanvas(ctx)
  
  // Draw title
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 24px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('OMR TEST TEMPLATE', OMR_TEMPLATE.width / 2, 50)
  
  ctx.font = '14px Arial'
  ctx.fillText(`Student ID: ${config.studentId.padStart(10, '0')}`, OMR_TEMPLATE.width / 2, 75)
  ctx.fillText(`Answers: ${config.answers.slice(0, 10).join(',')}...`, OMR_TEMPLATE.width / 2, 95)
  
  // Draw Student ID
  drawStudentIdCanvas(ctx, config.studentId, config.fillBubbles)
  
  // Draw Answers
  drawAnswersCanvas(ctx, config.answers, config.numQuestions, config.fillBubbles)
  
  // Debug grid
  if (config.showDebugGrid) {
    drawDebugGridCanvas(ctx)
  }
  
  return canvas.toDataURL('image/png')
}

function drawCornerMarkersCanvas(ctx: CanvasRenderingContext2D) {
  const inset = OMR_TEMPLATE.cornerMarkerInset
  const size = 22
  
  const corners = [
    { x: inset, y: inset },
    { x: OMR_TEMPLATE.width - inset - size, y: inset },
    { x: inset, y: OMR_TEMPLATE.height - inset - size },
    { x: OMR_TEMPLATE.width - inset - size, y: OMR_TEMPLATE.height - inset - size },
  ]
  
  corners.forEach(corner => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(corner.x, corner.y, size, size)
    
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(corner.x + size * 0.25, corner.y + size * 0.25, size * 0.5, size * 0.5)
    
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(corner.x + size / 2, corner.y + size / 2, size * 0.15, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawStudentIdCanvas(ctx: CanvasRenderingContext2D, studentId: string, fill: boolean) {
  const { studentIdStartX: startX, studentIdStartY: startY, bubbleWidth: w, bubbleHeight: h, bubbleSpacingX: spX, bubbleSpacingY: spY } = OMR_TEMPLATE
  
  // Label
  ctx.font = 'bold 14px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('STUDENT ID', startX, startY - 15)
  
  // Column headers
  ctx.font = '10px Arial'
  ctx.textAlign = 'center'
  for (let col = 0; col < 10; col++) {
    ctx.fillText(`${col + 1}`, startX + col * spX + w / 2, startY - 5)
  }
  
  // Row labels
  ctx.textAlign = 'right'
  for (let digit = 0; digit <= 9; digit++) {
    ctx.fillText(`${digit}`, startX - 5, startY + digit * spY + h / 2 + 4)
  }
  
  // Bubbles
  const paddedId = studentId.padStart(10, '0')
  for (let col = 0; col < 10; col++) {
    for (let digit = 0; digit <= 9; digit++) {
      const x = startX + col * spX + w / 2
      const y = startY + digit * spY + h / 2
      
      const expectedDigit = parseInt(paddedId[col], 10)
      const shouldFill = fill && digit === expectedDigit
      
      ctx.beginPath()
      ctx.ellipse(x, y, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2)
      
      if (shouldFill) {
        ctx.fillStyle = '#000000'
        ctx.fill()
      } else {
        ctx.strokeStyle = '#666666'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }
}

function drawAnswersCanvas(ctx: CanvasRenderingContext2D, answers: string[], numQ: number, fill: boolean) {
  const { answersStartX: startX, answersStartY: startY, bubbleWidth: w, bubbleHeight: h, bubbleSpacingX: spX, bubbleSpacingY: spY, questionsPerColumn: qPerCol, options } = OMR_TEMPLATE
  
  // Label
  ctx.font = 'bold 14px Arial'
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'left'
  ctx.fillText('ANSWERS', startX, startY - 15)
  
  // Option headers
  ctx.font = '10px Arial'
  ctx.textAlign = 'center'
  options.forEach((opt, i) => {
    ctx.fillText(opt, startX + i * spX + w / 2, startY - 5)
  })
  
  // Questions
  for (let q = 0; q < numQ; q++) {
    const col = Math.floor(q / qPerCol)
    const row = q % qPerCol
    
    const colOffset = col * (5 * spX + 50)
    const qStartX = startX + colOffset
    const qStartY = startY + row * spY
    
    // Question number
    ctx.font = '9px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.fillText(`${q + 1}.`, qStartX - 5, qStartY + h / 2 + 3)
    
    // Option bubbles
    for (let opt = 0; opt < 5; opt++) {
      const x = qStartX + opt * spX + w / 2
      const y = qStartY + h / 2
      
      const expectedAnswer = answers[q] || ''
      const shouldFill = fill && options[opt] === expectedAnswer
      
      ctx.beginPath()
      ctx.ellipse(x, y, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2)
      
      if (shouldFill) {
        ctx.fillStyle = '#000000'
        ctx.fill()
      } else {
        ctx.strokeStyle = '#666666'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }
}

function drawDebugGridCanvas(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)'
  ctx.lineWidth = 0.5
  ctx.font = '10px Arial'
  ctx.fillStyle = 'rgba(255, 0, 0, 0.7)'
  ctx.textAlign = 'left'
  
  for (let x = 0; x <= OMR_TEMPLATE.width; x += 100) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, OMR_TEMPLATE.height)
    ctx.stroke()
    ctx.fillText(`${x}`, x + 2, 120)
  }
  
  for (let y = 0; y <= OMR_TEMPLATE.height; y += 100) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(OMR_TEMPLATE.width, y)
    ctx.stroke()
    if (y > 0) ctx.fillText(`${y}`, 5, y - 2)
  }
}
