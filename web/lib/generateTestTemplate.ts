/**
 * Test Template Generator
 * 
 * Creates pre-filled test templates for verifying OMR accuracy.
 * Uses the same coordinates as generateTemplate.ts and sharp-omr-processor.ts
 * 
 * Test Data:
 * - Student ID: 1234567890
 * - Answers: A, B, C, D, A, B, C, D, A, B (first 10)
 */

import jsPDF from 'jspdf'
import { TEMPLATE_CONFIG } from './generateTemplate'

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA - Hardcoded for verification
// ═══════════════════════════════════════════════════════════════════════════════

export const TEST_DATA = {
  studentId: '1234567890',
  answers: ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B'] as string[],
  numQuestions: 10,
  examName: 'OMR TEST TEMPLATE',
  className: 'Test Class',
}

export interface TestTemplateConfig {
  studentId: string
  answers: string[]
  numQuestions: number
  fillBubbles: boolean
  showDebugGrid: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE TEST TEMPLATE AS CANVAS (for preview and testing)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateTestTemplateCanvas(config: TestTemplateConfig): string {
  const { studentId, answers, numQuestions, fillBubbles, showDebugGrid } = config
  const { width, height, margin, cornerMarker, studentId: sidConfig, answers: ansConfig } = TEMPLATE_CONFIG
  
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  
  // Debug grid
  if (showDebugGrid) {
    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 0.5
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
  }
  
  // Corner markers
  const { inset, size } = cornerMarker
  const corners = [
    { x: inset, y: inset },
    { x: width - inset - size, y: inset },
    { x: inset, y: height - inset - size },
    { x: width - inset - size, y: height - inset - size },
  ]
  corners.forEach(pos => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(pos.x, pos.y, size, size)
    ctx.fillStyle = '#FFFFFF'
    const inner = size * 0.3
    ctx.fillRect(pos.x + inner, pos.y + inner, size - inner * 2, size - inner * 2)
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(pos.x + size / 2, pos.y + size / 2, size * 0.15, 0, Math.PI * 2)
    ctx.fill()
  })
  
  // Header
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 28px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('OMR TEST TEMPLATE', margin, 75)
  
  ctx.font = '14px Arial'
  ctx.fillStyle = '#444444'
  ctx.fillText(`Test Class | ${new Date().toLocaleDateString()}`, margin, 100)
  
  ctx.font = 'bold 12px Arial'
  ctx.fillStyle = '#ff0000'
  ctx.fillText(`Expected: Student ID = ${studentId} | Answers = ${answers.slice(0, 10).join(', ')}`, margin, 125)
  
  // Separator
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(margin, 140)
  ctx.lineTo(width - margin, 140)
  ctx.stroke()
  
  // Student ID Section
  const { startX: sidX, startY: sidY, bubbleRadius: sidR, spacingX: sidSX, spacingY: sidSY } = sidConfig
  
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('STUDENT ID', sidX, sidY - 30)
  
  // Column headers
  ctx.font = 'bold 10px Arial'
  ctx.textAlign = 'center'
  for (let col = 0; col < 10; col++) {
    ctx.fillText(String(col + 1), sidX + col * sidSX + sidR, sidY - 10)
  }
  
  // Student ID bubbles
  for (let digit = 0; digit <= 9; digit++) {
    const y = sidY + digit * sidSY + sidR
    
    // Row label
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.fillText(String(digit), sidX - 8, y + 4)
    
    for (let col = 0; col < 10; col++) {
      const x = sidX + col * sidSX + sidR
      const expectedDigit = parseInt(studentId[col] || '0')
      const isFilled = fillBubbles && digit === expectedDigit
      
      ctx.beginPath()
      ctx.arc(x, y, sidR, 0, Math.PI * 2)
      if (isFilled) {
        ctx.fillStyle = '#000000'
        ctx.fill()
      } else {
        ctx.strokeStyle = '#333333'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }
  }
  
  // Border
  ctx.strokeStyle = '#999999'
  ctx.lineWidth = 1
  ctx.strokeRect(sidX - 15, sidY - 45, 10 * sidSX + 20, 10 * sidSY + 30)
  
  // Answers Section
  const { startX: ansX, startY: ansY, bubbleRadius: ansR, spacingX: ansSX, spacingY: ansSY, columnWidth, options } = ansConfig
  
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('ANSWERS', ansX, ansY - 30)
  
  // Separator
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(ansX, ansY - 15)
  ctx.lineTo(width - margin, ansY - 15)
  ctx.stroke()
  
  // Option headers
  ctx.font = 'bold 9px Arial'
  ctx.textAlign = 'center'
  for (let opt = 0; opt < options.length; opt++) {
    ctx.fillText(options[opt], ansX + 25 + opt * ansSX + ansR, ansY + 10)
  }
  
  // Answer bubbles
  for (let q = 0; q < numQuestions; q++) {
    const col = Math.floor(q / 25)
    const row = q % 25
    
    const qStartX = ansX + col * columnWidth
    const qStartY = ansY + 20 + row * ansSY
    
    // Question number
    ctx.font = '10px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.fillText(`${q + 1}.`, qStartX + 20, qStartY + ansR + 4)
    
    // Bubbles
    for (let opt = 0; opt < options.length; opt++) {
      const x = qStartX + 25 + opt * ansSX + ansR
      const y = qStartY + ansR
      const expectedAnswer = answers[q] || ''
      const isFilled = fillBubbles && options[opt] === expectedAnswer
      
      ctx.beginPath()
      ctx.arc(x, y, ansR, 0, Math.PI * 2)
      if (isFilled) {
        ctx.fillStyle = '#000000'
        ctx.fill()
      } else {
        ctx.strokeStyle = '#333333'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }
  }
  
  // Footer
  ctx.font = 'bold 10px Arial'
  ctx.fillStyle = '#ff0000'
  ctx.textAlign = 'center'
  ctx.fillText(`Expected Results: Student ID = ${studentId}`, width / 2, height - 50)
  ctx.fillText(`Answers: ${answers.join(', ')}`, width / 2, height - 35)
  
  return canvas.toDataURL('image/png')
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE TEST TEMPLATE AS PDF (for printing)
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateTestTemplatePDF(config: TestTemplateConfig): Promise<void> {
  const pngDataUrl = generateTestTemplateCanvas(config)
  const { width, height } = TEMPLATE_CONFIG
  
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [width, height],
  })
  
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, width, height)
  pdf.save(`test-template-${config.studentId}.pdf`)
}
