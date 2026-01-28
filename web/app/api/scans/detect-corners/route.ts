import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

/**
 * POST /api/scans/detect-corners
 * 
 * Detect corner markers in a scanned bubble sheet image.
 * Returns corner positions for perspective correction.
 * 
 * Accepts either:
 * - JSON body with { image_base64: string, width: number, height: number }
 * - FormData with 'image' file
 */
export async function POST(request: NextRequest) {
  try {
    let imageBuffer: Buffer
    let imgWidth = 0
    let imgHeight = 0
    
    // Check content type to determine how to parse
    const contentType = request.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      // Parse JSON body with base64 image
      const body = await request.json()
      const { image_base64, width, height } = body
      
      if (!image_base64) {
        return NextResponse.json(
          { error: 'No image_base64 provided' },
          { status: 400 }
        )
      }
      
      imageBuffer = Buffer.from(image_base64, 'base64')
      imgWidth = width || 0
      imgHeight = height || 0
    } else {
      // Parse FormData
      const formData = await request.formData()
      const imageFile = formData.get('image') as Blob
      
      if (!imageFile) {
        return NextResponse.json(
          { error: 'No image provided' },
          { status: 400 }
        )
      }
      
      imageBuffer = Buffer.from(await imageFile.arrayBuffer())
    }
    
    // Get image metadata if not provided
    if (!imgWidth || !imgHeight) {
      const metadata = await sharp(imageBuffer).metadata()
      imgWidth = metadata.width || 0
      imgHeight = metadata.height || 0
    }
    
    console.log(`Corner detection: Processing ${imgWidth}x${imgHeight} image`)
    
    // Resize to standard size for consistent detection
    const targetWidth = 850
    const targetHeight = 1100
    
    const { data: pixelData, info } = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    // Expected corner marker positions (40px inset, 22px size)
    const markerInset = 40
    const markerSize = 22
    const searchRadius = 30 // Search area around expected position
    
    const expectedCorners = [
      { name: 'topLeft', x: markerInset + markerSize / 2, y: markerInset + markerSize / 2 },
      { name: 'topRight', x: targetWidth - markerInset - markerSize / 2, y: markerInset + markerSize / 2 },
      { name: 'bottomLeft', x: markerInset + markerSize / 2, y: targetHeight - markerInset - markerSize / 2 },
      { name: 'bottomRight', x: targetWidth - markerInset - markerSize / 2, y: targetHeight - markerInset - markerSize / 2 },
    ]
    
    // Detect actual corner positions by finding darkest regions near expected positions
    const detectedCorners: Record<string, { x: number; y: number; confidence: number }> = {}
    
    for (const expected of expectedCorners) {
      const result = findCornerMarker(
        pixelData,
        info.width,
        info.height,
        expected.x,
        expected.y,
        searchRadius,
        markerSize
      )
      
      detectedCorners[expected.name] = result
    }
    
    // Calculate scale factors back to original image size
    const scaleX = imgWidth / targetWidth
    const scaleY = imgHeight / targetHeight
    
    // Scale corners back to original image coordinates
    const originalCorners = {
      topLeft: {
        x: Math.round(detectedCorners.topLeft.x * scaleX),
        y: Math.round(detectedCorners.topLeft.y * scaleY),
        confidence: detectedCorners.topLeft.confidence,
      },
      topRight: {
        x: Math.round(detectedCorners.topRight.x * scaleX),
        y: Math.round(detectedCorners.topRight.y * scaleY),
        confidence: detectedCorners.topRight.confidence,
      },
      bottomLeft: {
        x: Math.round(detectedCorners.bottomLeft.x * scaleX),
        y: Math.round(detectedCorners.bottomLeft.y * scaleY),
        confidence: detectedCorners.bottomLeft.confidence,
      },
      bottomRight: {
        x: Math.round(detectedCorners.bottomRight.x * scaleX),
        y: Math.round(detectedCorners.bottomRight.y * scaleY),
        confidence: detectedCorners.bottomRight.confidence,
      },
    }
    
    // Calculate overall confidence
    const avgConfidence = Math.round(
      (detectedCorners.topLeft.confidence +
        detectedCorners.topRight.confidence +
        detectedCorners.bottomLeft.confidence +
        detectedCorners.bottomRight.confidence) / 4
    )
    
    console.log(`Corner detection complete. Confidence: ${avgConfidence}%`)
    
    return NextResponse.json({
      success: true,
      corners: originalCorners,
      normalizedCorners: detectedCorners, // In 850x1100 space
      confidence: avgConfidence,
      imageSize: { width: imgWidth, height: imgHeight },
    })
    
  } catch (error) {
    console.error('Corner detection error:', error)
    return NextResponse.json(
      { error: 'Corner detection failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Find a corner marker by searching for the darkest region near expected position
 */
function findCornerMarker(
  pixelData: Buffer,
  width: number,
  height: number,
  expectedX: number,
  expectedY: number,
  searchRadius: number,
  markerSize: number
): { x: number; y: number; confidence: number } {
  let bestX = expectedX
  let bestY = expectedY
  let lowestBrightness = 255
  
  // Search grid around expected position
  const step = 2
  for (let dy = -searchRadius; dy <= searchRadius; dy += step) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
      const cx = Math.round(expectedX + dx)
      const cy = Math.round(expectedY + dy)
      
      // Get average brightness in a small region around this point
      const brightness = getAverageBrightness(
        pixelData,
        width,
        height,
        cx - markerSize / 4,
        cy - markerSize / 4,
        markerSize / 2,
        markerSize / 2
      )
      
      if (brightness < lowestBrightness) {
        lowestBrightness = brightness
        bestX = cx
        bestY = cy
      }
    }
  }
  
  // Refine with finer search
  const fineRadius = step * 2
  for (let dy = -fineRadius; dy <= fineRadius; dy++) {
    for (let dx = -fineRadius; dx <= fineRadius; dx++) {
      const cx = Math.round(bestX + dx)
      const cy = Math.round(bestY + dy)
      
      const brightness = getAverageBrightness(
        pixelData,
        width,
        height,
        cx - markerSize / 4,
        cy - markerSize / 4,
        markerSize / 2,
        markerSize / 2
      )
      
      if (brightness < lowestBrightness) {
        lowestBrightness = brightness
        bestX = cx
        bestY = cy
      }
    }
  }
  
  // Calculate confidence based on how dark the marker is
  // A good marker should be very dark (brightness < 50)
  const confidence = Math.round(Math.max(0, Math.min(100, (255 - lowestBrightness) / 2.55)))
  
  return { x: bestX, y: bestY, confidence }
}

/**
 * Get average brightness in a rectangular region
 */
function getAverageBrightness(
  pixelData: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number
): number {
  let sum = 0
  let count = 0
  
  const startX = Math.max(0, Math.floor(x))
  const endX = Math.min(width, Math.floor(x + w))
  const startY = Math.max(0, Math.floor(y))
  const endY = Math.min(height, Math.floor(y + h))
  
  for (let py = startY; py < endY; py++) {
    for (let px = startX; px < endX; px++) {
      const idx = py * width + px
      if (idx >= 0 && idx < pixelData.length) {
        sum += pixelData[idx]
        count++
      }
    }
  }
  
  return count > 0 ? sum / count : 255
}
