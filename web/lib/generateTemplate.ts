import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'

interface TemplateData {
  exam_id: string
  exam_name: string
  class_name: string
  exam_date: string
  student_id_length: number
  exam_code_hash?: number // 32-bit hash for custom barcode
  num_questions?: number // optional, defaults to 70
  show_grid?: boolean // optional grid overlay for positioning
  layout?: {
    header?: { x: number; y: number }
    bubbles?: { x: number; y: number }
    studentId?: { x: number; y: number }
    qr?: { x: number; y: number }
  }
}

// Generate 32-bit hash from exam_id UUID for custom barcode
function generateExamHash(examId: string): number {
  let hash = 0
  for (let i = 0; i < examId.length; i++) {
    const char = examId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & 0x7FFFFFFF // Keep it positive 32-bit
  }
  return hash
}

type Ctx = CanvasRenderingContext2D

function drawHeader(ctx: Ctx, pos: { x: number; y: number }, width: number) {
  // Symmetric header: consistent left/right padding and row heights
  const leftPad = 20
  const gapX = 24
  const rowGap = 10
  const boxH1 = 40 // taller first row boxes
  const boxH2 = 36 // taller second row boxes

  let yPos = pos.y
  ctx.textAlign = 'left'
  ctx.font = 'bold 16px Arial' // bigger labels
  ctx.fillText('Name', pos.x + leftPad, yPos)
  // Compute symmetrical columns using provided width
  const totalWidth = Math.max(500, Math.floor(width))
  const col1W = 360
  const col2W = totalWidth - col1W - gapX
  // Make the visible box tangent to the left edge: start boxes at pos.x
  const col1X = pos.x
  const col2X = col1X + col1W + gapX
  ctx.fillText('Student Number', col2X, yPos)

  yPos += rowGap
  ctx.lineWidth = 1.5
  ctx.strokeRect(col1X, yPos, col1W, boxH1)
  ctx.strokeRect(col2X, yPos, col2W, boxH1)

  yPos += boxH1 + 16 // vertical spacing between rows
  ctx.font = 'bold 16px Arial'
  ctx.fillText('Year & Section', col1X, yPos)
  // Three symmetric columns on second row
  const total2Width = totalWidth
  const gap2 = 24
  const colA = Math.floor((total2Width - gap2 * 2) / 3)
  const colAX = col1X
  const colBX = colAX + colA + gap2
  const colCX = colBX + colA + gap2
  ctx.fillText('Instructor', colBX, yPos)
  ctx.fillText('Date', colCX, yPos)

  yPos += rowGap
  ctx.strokeRect(colAX, yPos, colA, boxH2)
  ctx.strokeRect(colBX, yPos, colA, boxH2)
  ctx.strokeRect(colCX, yPos, colA, boxH2)
}

function drawQr(
  ctx: Ctx,
  pos: { x: number; y: number },
  qrImage: HTMLImageElement,
  info: { exam_name: string; class_name: string; exam_date: string },
  options?: { interpretAsCartesianBottomLeft?: boolean; cx?: number; cy?: number }
) {
  const qrSize = 110
  let drawX = pos.x
  let drawY = pos.y
  if (options?.interpretAsCartesianBottomLeft && typeof options.cx === 'number' && typeof options.cy === 'number') {
    // Convert Cartesian bottom-left (x,y) to canvas top-left for image
    const bottomLeftCanvasX = (options.cx as number) + pos.x
    const bottomLeftCanvasY = (options.cy as number) - pos.y
    drawX = bottomLeftCanvasX
    drawY = bottomLeftCanvasY - qrSize
  }
  ctx.drawImage(qrImage, drawX, drawY, qrSize, qrSize)
  ctx.font = 'bold 11px Arial'
  ctx.textAlign = 'left'
  ctx.fillText(info.exam_name, drawX + qrSize + 15, drawY + 30)
  ctx.fillText(info.class_name, drawX + qrSize + 15, drawY + 50)
  ctx.fillText(info.exam_date, drawX + qrSize + 15, drawY + 70)
}

function drawBarcode(
  ctx: Ctx,
  pos: { x: number; y: number },
  value: string,
  options?: { rotate?: boolean; height?: number; widthScale?: number; displayValue?: boolean }
) {
  const tempCanvas = document.createElement('canvas') as HTMLCanvasElement
  const height = options?.height ?? 120
  const widthScale = options?.widthScale ?? 2
  const displayValue = options?.displayValue ?? true
  // Render Code128 onto temp canvas
  JsBarcode(tempCanvas, value, {
    format: 'CODE128',
    width: widthScale,
    height,
    margin: 0,
    displayValue,
    fontSize: 12,
    textMargin: 6,
  })
  // Draw onto main canvas, optionally rotated
  const drawX = pos.x
  const drawY = pos.y
  if (options?.rotate) {
    ctx.save()
    ctx.translate(drawX, drawY)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(tempCanvas, 0, 0)
    ctx.restore()
  } else {
    ctx.drawImage(tempCanvas, drawX, drawY)
  }
}

// Custom stacked binary barcode: multiple horizontal bars (presence=1, absence=0)
function drawStackedBinaryBarcode(
  ctx: Ctx,
  area: { x: number; yTop: number; yBottom: number; width: number },
  bits: string,
  opts?: { barHeight?: number; gap?: number }
) {
  const barHeight = opts?.barHeight ?? 10
  const gap = opts?.gap ?? 6
  const totalBars = bits.length
  const neededHeight = totalBars * barHeight + (totalBars - 1) * gap
  // Start from yTop and stack downward; clamp to available area
  const availableHeight = Math.max(0, area.yBottom - area.yTop)
  const scale = neededHeight > availableHeight ? availableHeight / neededHeight : 1
  const h = Math.max(2, Math.floor(barHeight * scale))
  const g = Math.max(2, Math.floor(gap * scale))
  let y = area.yTop
  ctx.fillStyle = '#000'
  for (let i = 0; i < totalBars; i++) {
    const bit = bits[i]
    if (bit === '1') {
      ctx.fillRect(area.x, y, area.width, h)
    }
    y += h + g
    if (y > area.yBottom) break
  }
}

function encodeBCD(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(-4).padStart(4, '0')
  let out = ''
  for (const ch of clean) {
    const n = ch.charCodeAt(0) - 48
    out += n.toString(2).padStart(4, '0')
  }
  return out
}

function drawStudentId(
  ctx: Ctx,
  pos: { x: number; y: number },
  cfg: { idDigits: number; columnWidth: number; leftMargin: number; verticalSpacing: number; bubbleRadius: number; center?: boolean }
) {
  const idDigits = cfg.idDigits
  let idX = cfg.leftMargin
  const idY = pos.y
  // Center the entire Student ID group under columns and anchor the label to that center
  const bubbleSpacing = 22
  const boxWidth = 20
  const boxHeight = 28
  const totalWidth = idDigits * bubbleSpacing
  if (cfg.center) {
    idX = cfg.leftMargin + Math.floor((cfg.columnWidth * 4 - totalWidth) / 2)
  }

  ctx.font = 'bold 13px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('Student ID', idX - 5, idY - 5)
  for (let d = 0; d < idDigits; d++) {
    const boxX = idX + d * bubbleSpacing
    ctx.lineWidth = 1.5
    ctx.strokeRect(boxX, idY + 10, boxWidth, boxHeight)
  }
  ctx.font = 'bold 11px Arial'
  const gridStartY = idY + boxHeight + 25
  const rowHeight = 23
  for (let num = 0; num <= 9; num++) {
    for (let digit = 0; digit < idDigits; digit++) {
      const digitX = idX + 10 + digit * bubbleSpacing
      const bubbleY = gridStartY + num * rowHeight
      ctx.beginPath()
      ctx.arc(digitX, bubbleY, cfg.bubbleRadius, 0, Math.PI * 2)
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillText(num.toString(), digitX, bubbleY + 4)
    }
  }
  ctx.lineWidth = 2
  ctx.strokeRect(idX - 5, idY + 5, totalWidth + 10, boxHeight + 10 * rowHeight + 14)
}

function drawBubbles(
  ctx: Ctx,
  pos: { x: number; y: number },
  params: {
    numQuestions: number
    perColumnCounts: [number, number, number, number]
    columnWidth: number
    leftMargin: number
    verticalSpacing: number
    bubbleRadius: number
    horizontalSpacing: number
    perColumnBottoms?: [number, number, number, number]
    cy?: number
  }
) {
  ctx.font = 'bold 12px Arial'
  ctx.textAlign = 'left'
  // Set bubbles vertical span: Cartesian top y = 275, bottom y = -400
  const yTop = (params.cy ?? 0) - 275
  const defaultBottom = (params.cy ?? 0) - (-400)
  const yBottoms: [number, number, number, number] = params.perColumnBottoms
    ? params.perColumnBottoms
    : [defaultBottom, defaultBottom, defaultBottom, defaultBottom]
  const yMid = (params.cy ?? 0)
  // No mid-gap: evenly distribute questions across full span

  // Determine per-column question counts
  const perCounts = params.perColumnCounts
  const interGap = 24
  const colBaseX = [
    params.leftMargin,
    params.leftMargin + params.columnWidth + interGap,
    params.leftMargin + (params.columnWidth + interGap) * 2,
    params.leftMargin + (params.columnWidth + interGap) * 3,
  ]

  // Use a uniform vertical spacing based on columns 1–3
  const baseSpan13 = yBottoms[0] - yTop
  const maxSteps13 = Math.max(1, Math.max(perCounts[0] - 1, perCounts[1] - 1, perCounts[2] - 1))
  const uniformSpacing = Math.floor(baseSpan13 / maxSteps13)

  for (let q = 1; q <= params.numQuestions; q++) {
    // Determine which column this question belongs to (sequential distribution across 4 columns)
    let columnIndex: number
    let indexInColumn: number
    if (q <= perCounts[0]) {
      columnIndex = 0
      indexInColumn = q - 1
    } else if (q <= perCounts[0] + perCounts[1]) {
      columnIndex = 1
      indexInColumn = q - perCounts[0] - 1
    } else if (q <= perCounts[0] + perCounts[1] + perCounts[2]) {
      columnIndex = 2
      indexInColumn = q - (perCounts[0] + perCounts[1]) - 1
    } else {
      columnIndex = 3
      indexInColumn = q - (perCounts[0] + perCounts[1] + perCounts[2]) - 1
    }

    const baseX = colBaseX[columnIndex]

    // All columns: undivided, evenly spaced using uniform spacing from columns 1–3
    let questionY: number
    const colBottom = yBottoms[columnIndex]
    const spacing = uniformSpacing
    questionY = Math.min(yTop + indexInColumn * spacing, colBottom)

    ctx.fillText(q.toString(), baseX, questionY + 4)
    const choices = ['A', 'B', 'C', 'D']
    choices.forEach((choice, index) => {
      const bubbleX = baseX + 30 + index * params.horizontalSpacing
      ctx.beginPath()
      ctx.arc(bubbleX, questionY, params.bubbleRadius, 0, Math.PI * 2)
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.font = `bold ${Math.max(9, Math.floor(params.bubbleRadius * 1.0))}px Arial`
      ctx.textAlign = 'center'
      ctx.fillText(choice, bubbleX, questionY + Math.floor(params.bubbleRadius * 0.35))
    })
  }
}

export async function generateBubbleSheetPDF(data: TemplateData): Promise<{ png: string; pdf: string }> {
  // Fixed canvas dimensions to match standard paper size
  const canvasWidth = 850
  const canvasHeight = 1100
  const numQuestions = data.num_questions || 70
  const showGrid = Boolean(data.show_grid)
  
  // Calculate optimal sizing based on number of questions
  const margin = 20
  const headerHeight = 150
  let qpcComputed = Math.ceil(numQuestions / 4)
  
  // Available space for questions and student ID
  const qrSectionHeight = 130
  const availableHeight = canvasHeight - margin * 2 - headerHeight - qrSectionHeight
  
  // Calculate dynamic spacing to fill available space
  const studentIdHeight = 280
  const questionSectionHeight = availableHeight - studentIdHeight - 20
  let verticalSpacing = qpcComputed > 1
    ? Math.max(20, Math.floor(questionSectionHeight / (qpcComputed - 1)))
    : Math.max(24, Math.floor(questionSectionHeight))
  
  // Dynamic bubble sizing tuned per item count
  let bubbleRadius = Math.max(8, Math.min(16, Math.floor(verticalSpacing * 0.40)))
  let horizontalSpacing = Math.max(22, Math.floor(verticalSpacing * 0.90))
  // Keep 70-item sizing as-is; adjust others slightly
  if (numQuestions >= 95 && numQuestions <= 110) {
    bubbleRadius = Math.max(10, Math.min(18, Math.floor(verticalSpacing * 0.48)))
    horizontalSpacing = Math.max(24, Math.floor(verticalSpacing * 0.95))
  } else if (numQuestions <= 55) {
    bubbleRadius = Math.max(9, Math.min(14, Math.floor(verticalSpacing * 0.35)))
    horizontalSpacing = Math.max(22, Math.floor(verticalSpacing * 0.85))
  }
  
  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')!
  
  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  ctx.fillStyle = '#000000'

  // Optional Cartesian grid overlay for precise coordinates
    // Optional centered Cartesian axes + grid overlay
    if (showGrid) {
      const minor = 25
      const major = 100
      const cx = Math.floor(canvasWidth / 2)
      const cy = Math.floor(canvasHeight / 2)

      ctx.save()

      // Draw minor grid (light)
      ctx.strokeStyle = '#eef2f7'
      ctx.lineWidth = 1
      for (let x = 0; x <= canvasWidth; x += minor) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvasHeight)
        ctx.stroke()
      }
      for (let y = 0; y <= canvasHeight; y += minor) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvasWidth, y)
        ctx.stroke()
      }

      // Draw major grid (darker)
      ctx.strokeStyle = '#d5dae1'
      ctx.lineWidth = 1.25
      for (let x = 0; x <= canvasWidth; x += major) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvasHeight)
        ctx.stroke()
      }
      for (let y = 0; y <= canvasHeight; y += major) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvasWidth, y)
        ctx.stroke()
      }

      // Draw X and Y axes centered (origin at canvas center)
      ctx.strokeStyle = '#ef4444' // red X axis
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, cy)
      ctx.lineTo(canvasWidth, cy)
      ctx.stroke()

      ctx.strokeStyle = '#0ea5e9' // blue Y axis
      ctx.beginPath()
      ctx.moveTo(cx, 0)
      ctx.lineTo(cx, canvasHeight)
      ctx.stroke()

      // Draw tick marks on axes every major interval
      const tick = 6
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1.5
      // X-axis ticks
      for (let x = 0; x <= canvasWidth; x += major) {
        ctx.beginPath()
        ctx.moveTo(x, cy - tick)
        ctx.lineTo(x, cy + tick)
        ctx.stroke()
      }
      // Y-axis ticks
      for (let y = 0; y <= canvasHeight; y += major) {
        ctx.beginPath()
        ctx.moveTo(cx - tick, y)
        ctx.lineTo(cx + tick, y)
        ctx.stroke()
      }

      // Label axes with Cartesian coordinates relative to center
      ctx.fillStyle = '#334155'
      ctx.font = '12px Arial'
      // X labels
      for (let x = 0; x <= canvasWidth; x += major) {
        const xv = x - cx
        if (xv === 0) continue
        ctx.fillText(`${xv}`, x + 3, cy - 8)
      }
      // Y labels
      for (let y = 0; y <= canvasHeight; y += major) {
        const yv = cy - y
        if (yv === 0) continue
        ctx.fillText(`${yv}`, cx + 8, y - 4)
      }

      // Origin marker and label
      ctx.fillStyle = '#111827'
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = '12px Arial'
      ctx.fillText('(0, 0)', cx + 10, cy - 10)

      ctx.restore()
  }
  
  // Corner registration marks with concentric circles for better OpenCV detection
  const squareSize = 22
  const inset = 40
  const drawAlignmentMarker = (x: number, y: number) => {
    // Outer black square
    ctx.fillStyle = '#000'
    ctx.fillRect(x, y, squareSize, squareSize)
    // White inner square
    ctx.fillStyle = '#FFF'
    ctx.fillRect(x + 6, y + 6, 10, 10)
    // Black center dot for precise detection
    ctx.fillStyle = '#000'
    ctx.fillRect(x + 9, y + 9, 4, 4)
  }
  drawAlignmentMarker(margin + inset, margin + inset)
  drawAlignmentMarker(canvasWidth - margin - inset - squareSize, margin + inset)
  drawAlignmentMarker(margin + inset, canvasHeight - margin - inset - squareSize)
  drawAlignmentMarker(canvasWidth - margin - inset - squareSize, canvasHeight - margin - inset - squareSize)
  ctx.fillStyle = '#000'

  // Define safe content bounds inside the corner boxes
  const safeLeft = margin + inset + squareSize + 10
  const safeTop = margin + inset + squareSize + 10
  const safeRight = canvasWidth - (margin + inset + squareSize + 10)
  const safeBottom = canvasHeight - (margin + inset + squareSize + 10)

  // Layout defaults and grouped render
  // Position header so its CENTER is at Cartesian (0, 450)
  // Cartesian to canvas: X_canvas = cx + X_cart, Y_canvas = cy - Y_cart
  const cx = Math.floor(canvasWidth / 2)
  const cy = Math.floor(canvasHeight / 2)
  // Dynamically span from fixed left to inner right corner box
  let approxHeaderWidth = 650
  const approxHeaderHeight = headerHeight // ~150 from existing constant
  // Snap header's left edge exactly to inner left corner box
  // Snap header's left edge to the INNER tip of the corner box (safe area)
  let headerTopLeftX = safeLeft
  // Ensure header fits within safe bounds horizontally
  // Extend header to the INNER right tip of the corner box
  approxHeaderWidth = safeRight - headerTopLeftX
    // Place the very top edge of the header just below Cartesian (0, 435)
    // Cartesian to canvas: Y_canvas = cy - Y_cart
    const headerTopEdge = cy - 435 + 5 // 5px below the line for a small margin
    const headerTopLeftY = Math.max(headerTopEdge, safeTop)

  // Lock header position: do not allow external overrides
  const incomingLayout = data.layout || {}
  const layout = {
    header: { x: headerTopLeftX, y: headerTopLeftY },
    // Bubbles top boundary fixed at Cartesian y = 350
    // Convert to canvas coordinates: leftmost bubbles at prior default x; top at y per drawBubbles
    bubbles: incomingLayout.bubbles ?? { x: Math.max(cx - 350, safeLeft), y: Math.max(cy - 350, safeTop) },
    studentId: incomingLayout.studentId ?? { x: 0, y: 0 }, // computed below
    qr: incomingLayout.qr ?? { x: margin + 15, y: canvasHeight - qrSectionHeight + 20 },
  }

  // Draw header spanning to the inner right corner box
  drawHeader(ctx, layout.header, approxHeaderWidth)

  // Main content area - Questions grid fills available space
  let yPos = layout.bubbles.y
  // Anchor leftmost bubbles at Cartesian x = -300
  let leftMargin = Math.max(cx - 300, safeLeft)

  // Compute Student ID section footprint early to reserve right-side width for bubbles
  const idDigits = data.student_id_length > 10 ? 10 : data.student_id_length
  const idBubbleSpacing = 22
  const idBoxHeight = 28
  const idRowHeight = 23
  const idTotalWidth = idDigits * idBubbleSpacing + 10
  const rightReserve = idTotalWidth + 15 // keep a safety gap so col 4 won't touch Student ID

  // Calculate column width using reserved right-side space
  // Keep leftMargin fixed to x=-300; compute available width with right-side reserve
  const usableRight = Math.min(safeRight, canvasWidth - margin - inset - squareSize - 10 - rightReserve)
  const usableWidth = Math.max(0, usableRight - leftMargin)

  // Compute Student ID preview box to align column 4 with its left edge
  const targetBRX_preview = Math.min(cx + 350, safeRight - 10)
  const targetBRY_preview = Math.min(cy + 450, safeBottom - 10)
  const previewTotalWidth = idDigits * idBubbleSpacing + 10
  const previewTotalHeight = idBoxHeight + 10 * idRowHeight + 14
  const studentIdTopLeftX_preview = targetBRX_preview - previewTotalWidth + 5
  const studentIdTopLeftY_preview = targetBRY_preview - previewTotalHeight - 5

  // Increase gap and align 4th column left edge with Student ID left edge
  const interColumnGap = 24
  const studentIdLeftEdge = studentIdTopLeftX_preview
  const widthForColumns = Math.max(0, studentIdLeftEdge - leftMargin - 3 * interColumnGap)
  const columnWidth = Math.max(40, Math.floor(widthForColumns / 3))
  // Clamp bubbles vertical extent between Cartesian top y=275 and bottom y=-400
  const bubblesTopCanvasY = Math.max(cy - 275, safeTop)
  // Explicit bottom for columns 1-3 at Cartesian y = -375
  const bubblesBottomCanvasY = Math.min(cy - (-375), safeBottom)
  // Column 4 must not exceed beyond y = -100 (Cartesian)
  const col4BottomCanvasY = Math.min(cy - (-100), bubblesBottomCanvasY)

  // Derive the maximum items per column that fit evenly in the vertical span
  const verticalSpan = bubblesBottomCanvasY - bubblesTopCanvasY
  const minSpacing = Math.max(20, verticalSpacing)
  const maxPerColumn13 = Math.max(1, Math.floor(verticalSpan / minSpacing) + 1)
  const col4Span = col4BottomCanvasY - bubblesTopCanvasY
  const maxPerColumn4 = Math.max(1, Math.floor(col4Span / minSpacing) + 1)
  // Prefer loading columns 1-3, keep column 4 within its cap
  const base13 = Math.min(Math.ceil((numQuestions * 0.9) / 3), maxPerColumn13)
  let c1 = Math.min(base13, numQuestions)
  let c2 = Math.min(base13, Math.max(0, numQuestions - c1))
  let c3 = Math.min(base13, Math.max(0, numQuestions - c1 - c2))
  let remainder = Math.max(0, numQuestions - c1 - c2 - c3)
  let c4 = Math.min(remainder, maxPerColumn4)
  // If remainder still exists, try to fill columns 1-3 up to their caps
  remainder = Math.max(0, remainder - c4)
  const fillInto13 = (cap: number, current: number) => Math.min(cap - current, remainder)
  if (remainder > 0) {
    const add1 = fillInto13(maxPerColumn13, c1); c1 += add1; remainder -= add1
  }
  if (remainder > 0) {
    const add2 = fillInto13(maxPerColumn13, c2); c2 += add2; remainder -= add2
  }
  if (remainder > 0) {
    const add3 = fillInto13(maxPerColumn13, c3); c3 += add3; remainder -= add3
  }
  // If still remainder, we cannot place more without violating bounds; clamp silently
  // If capacity is exceeded overall, tighten spacing to fit
  const totalCapacity = maxPerColumn13 * 3 + maxPerColumn4
  // If questions exceed capacity, tighten spacing just enough to fit
  if (numQuestions > totalCapacity) {
    const neededPerColumn = Math.ceil(numQuestions / 4)
    const neededSteps = Math.max(1, neededPerColumn - 1)
    const fittedSpacing = Math.max(12, Math.floor(verticalSpan / neededSteps))
    verticalSpacing = fittedSpacing
    const fitMax = Math.max(1, Math.floor(verticalSpan / fittedSpacing) + 1)
    c1 = Math.min(fitMax, numQuestions)
    c2 = Math.min(fitMax, Math.max(0, numQuestions - c1))
    c3 = Math.min(fitMax, Math.max(0, numQuestions - c1 - c2))
    c4 = Math.max(0, numQuestions - c1 - c2 - c3)
  }

  // Right side text (vertical) - repositioned
  ctx.save()
  ctx.translate(canvasWidth - margin + 8, yPos + 250)
  ctx.rotate(-Math.PI / 2)
  ctx.font = 'bold 11px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(`CPP106 Prelim Exam (2468106)`, 0, 0)
  ctx.restore()

  drawBubbles(ctx, layout.bubbles, {
    numQuestions,
    perColumnCounts: [c1, c2, c3, c4],
    columnWidth,
    leftMargin,
    verticalSpacing,
    bubbleRadius,
    horizontalSpacing,
    perColumnBottoms: [bubblesBottomCanvasY, bubblesBottomCanvasY, bubblesBottomCanvasY, col4BottomCanvasY],
    cy,
  })

  // Student ID section - positioned in available space after questions
  // Permanently place Student ID bottom-right corner at Cartesian (350, -450)
  // Convert to canvas coords: X_canvas = cx + 350, Y_canvas = cy - (-450) = cy + 450
  const targetBRX = Math.min(cx + 350, safeRight - 10)
  const targetBRY = Math.min(cy + 450, safeBottom - 10)
  // Compute Student ID section dimensions to derive its top-left
  const bubbleSpacing = 22
  const boxHeight = 28
  const rowHeight = 23
  const totalWidth = idDigits * bubbleSpacing + 10 // matches outer border width calculation
  const totalHeight = boxHeight + 10 * rowHeight + 14 // matches outer border height calculation
  const studentIdTopLeftX = targetBRX - totalWidth + 5
  const studentIdTopLeftY = targetBRY - totalHeight - 5
  drawStudentId(ctx, { x: studentIdTopLeftY /* pos.y used as idY */ ? studentIdTopLeftX : studentIdTopLeftX, y: Math.max(studentIdTopLeftY, safeTop + 10) }, { idDigits, columnWidth, leftMargin: Math.max(studentIdTopLeftX, safeLeft + 10), verticalSpacing, bubbleRadius, center: false })

  // Render custom stacked binary barcode: left side, full-width to safeLeft area
  // Generate or use provided exam hash for barcode
  const examHash = data.exam_code_hash || generateExamHash(data.exam_id)
  // Convert hash to 8-digit string (pad with zeros if needed)
  const examCode = examHash.toString().padStart(8, '0').slice(0, 8)
  // Encode as BCD: 8 digits -> 32 bars
  const binary = encodeBCD(examCode)
  // Place barcode with top anchored at Cartesian y = -150
  const bBarHeight = 8
  const bGap = 6
  const totalBars = binary.length
  const neededHeight = totalBars * bBarHeight + (totalBars - 1) * bGap
  const yTopCartesian = -150
  const yTopCanvas = cy - yTopCartesian // Cartesian to canvas: Y_canvas = cy - Y_cart
  const barcodeArea = {
    x: cx - 360,
    yTop: yTopCanvas,
    yBottom: yTopCanvas + neededHeight,
    width: Math.max(10, Math.min(16, squareSize))
  }
  drawStackedBinaryBarcode(ctx, barcodeArea, binary, { barHeight: bBarHeight, gap: bGap })

  // Generate QR code with exam metadata
  const qrData = JSON.stringify({
    exam_id: data.exam_id,
    exam_name: data.exam_name,
    student_id_length: data.student_id_length,
    num_questions: numQuestions
  })
  
  const qrCanvas = await QRCode.toCanvas(qrData, { width: 110, margin: 1 })
  const qrImage = new Image()
  await new Promise((resolve) => {
    qrImage.onload = resolve
    qrImage.src = qrCanvas.toDataURL()
  })
  
  drawQr(ctx, layout.qr, qrImage, {
    exam_name: data.exam_name,
    class_name: data.class_name,
    exam_date: data.exam_date
  })

  // Generate both PNG and PDF
  const pngDataUrl = canvas.toDataURL('image/png')
  
  // Create PDF with custom dimensions (850x1100px)
  const jsPDF = (await import('jspdf')).default
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [canvasWidth, canvasHeight]
  })
  
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, canvasWidth, canvasHeight)
  const pdfDataUrl = pdf.output('dataurlstring')
  
  return { png: pngDataUrl, pdf: pdfDataUrl }
}
