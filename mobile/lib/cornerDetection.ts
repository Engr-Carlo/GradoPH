/**
 * Corner Detection Module
 * Detects paper corners from camera frames for dynamic marker positioning
 */

export interface Point {
  x: number
  y: number
}

export interface DetectedCorners {
  topLeft: Point
  topRight: Point
  bottomLeft: Point
  bottomRight: Point
  confidence: number
  isStable: boolean
}

// Default corners (centered rectangle with template aspect ratio)
export const getDefaultCorners = (
  frameWidth: number,
  frameHeight: number,
  templateAspectRatio: number = 850 / 1100
): DetectedCorners => {
  const padding = 0.1 // 10% padding from edges
  const availableWidth = frameWidth * (1 - 2 * padding)
  const availableHeight = frameHeight * (1 - 2 * padding)
  
  let rectWidth, rectHeight
  if (availableWidth / availableHeight > templateAspectRatio) {
    rectHeight = availableHeight
    rectWidth = rectHeight * templateAspectRatio
  } else {
    rectWidth = availableWidth
    rectHeight = rectWidth / templateAspectRatio
  }
  
  const left = (frameWidth - rectWidth) / 2
  const top = (frameHeight - rectHeight) / 2
  const right = left + rectWidth
  const bottom = top + rectHeight
  
  return {
    topLeft: { x: left, y: top },
    topRight: { x: right, y: top },
    bottomLeft: { x: left, y: bottom },
    bottomRight: { x: right, y: bottom },
    confidence: 0,
    isStable: false,
  }
}

// Simple edge detection using pixel brightness analysis
// This is a simplified version - in production, use OpenCV or ML Kit
export function detectPaperEdges(
  imageData: Uint8Array,
  width: number,
  height: number
): DetectedCorners | null {
  // For now, return null to indicate no detection
  // Real implementation would analyze the image data
  return null
}

// Check if corners are stable (haven't moved much between frames)
let previousCorners: DetectedCorners | null = null
let stableFrameCount = 0
const STABILITY_THRESHOLD = 10 // pixels
const STABLE_FRAMES_REQUIRED = 5

export function checkStability(corners: DetectedCorners): boolean {
  if (!previousCorners) {
    previousCorners = corners
    stableFrameCount = 0
    return false
  }
  
  const maxMovement = Math.max(
    distance(corners.topLeft, previousCorners.topLeft),
    distance(corners.topRight, previousCorners.topRight),
    distance(corners.bottomLeft, previousCorners.bottomLeft),
    distance(corners.bottomRight, previousCorners.bottomRight)
  )
  
  if (maxMovement < STABILITY_THRESHOLD) {
    stableFrameCount++
  } else {
    stableFrameCount = 0
  }
  
  previousCorners = corners
  return stableFrameCount >= STABLE_FRAMES_REQUIRED
}

export function resetStability(): void {
  previousCorners = null
  stableFrameCount = 0
}

function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
}

// Perspective transform matrix calculation
export function getPerspectiveTransform(
  src: DetectedCorners,
  dstWidth: number,
  dstHeight: number
): number[][] {
  // Source points
  const srcPts = [
    [src.topLeft.x, src.topLeft.y],
    [src.topRight.x, src.topRight.y],
    [src.bottomRight.x, src.bottomRight.y],
    [src.bottomLeft.x, src.bottomLeft.y],
  ]
  
  // Destination points (rectangle)
  const dstPts = [
    [0, 0],
    [dstWidth, 0],
    [dstWidth, dstHeight],
    [0, dstHeight],
  ]
  
  // Compute 3x3 perspective transform matrix
  // This is a simplified version - for production, use a proper implementation
  return computeHomography(srcPts, dstPts)
}

function computeHomography(src: number[][], dst: number[][]): number[][] {
  // Simplified homography computation
  // Returns identity matrix for now - real implementation would compute actual transform
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
}
