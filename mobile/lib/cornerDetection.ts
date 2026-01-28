/**
 * Corner Detection Module
 * 
 * Detects paper corners from camera frames for dynamic marker positioning.
 * Uses server-side processing for accurate corner detection.
 */

import * as FileSystem from 'expo-file-system/legacy'
import { PRODUCTION_API_URL, isDevelopment, ALWAYS_USE_PRODUCTION_API } from '../config'

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

/**
 * Detect paper corners using server-side processing
 * 
 * @param imageUri - Local URI of the captured image
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @returns Detected corners in image coordinates
 */
export async function detectCornersFromServer(
  imageUri: string,
  imageWidth: number,
  imageHeight: number
): Promise<{ 
  success: boolean
  corners: DetectedCorners
  error?: string 
}> {
  try {
    // Get API URL
    const webApiUrl = ALWAYS_USE_PRODUCTION_API ? PRODUCTION_API_URL : 
                      (isDevelopment ? 'http://192.168.1.100:3000' : PRODUCTION_API_URL)
    
    // Read image file
    const imageBase64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    
    // Convert base64 to blob
    const imageBlob = base64ToBlob(imageBase64, 'image/jpeg')
    
    // Create form data
    const formData = new FormData()
    formData.append('image', imageBlob, 'capture.jpg')
    
    // Call corner detection API
    const response = await fetch(`${webApiUrl}/api/scans/detect-corners`, {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Server error: ${response.status}`)
    }
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error || 'Corner detection failed')
    }
    
    // Convert server corners to DetectedCorners format
    const corners: DetectedCorners = {
      topLeft: { x: result.corners.topLeft.x, y: result.corners.topLeft.y },
      topRight: { x: result.corners.topRight.x, y: result.corners.topRight.y },
      bottomLeft: { x: result.corners.bottomLeft.x, y: result.corners.bottomLeft.y },
      bottomRight: { x: result.corners.bottomRight.x, y: result.corners.bottomRight.y },
      confidence: result.confidence,
      isStable: result.confidence >= 70,
    }
    
    console.log(`Server corner detection: confidence=${result.confidence}%`)
    
    return { success: true, corners }
    
  } catch (error) {
    console.error('Server corner detection failed:', error)
    
    // Return default corners on error
    const defaultCorners = getDefaultCorners(imageWidth, imageHeight)
    return { 
      success: false, 
      corners: defaultCorners,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Simple local corner detection using brightness analysis
 * Fallback when server detection is not available
 */
export function detectCornersLocal(
  imageData: Uint8Array,
  width: number,
  height: number
): DetectedCorners | null {
  // This is a simplified local detection
  // For production, use the server-side detection
  return null
}

// Check if corners are stable (haven't moved much between frames)
let previousCorners: DetectedCorners | null = null
let stableFrameCount = 0
const STABILITY_THRESHOLD = 10 // pixels
const STABLE_FRAMES_REQUIRED = 3

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

/**
 * Validate that detected corners form a reasonable quadrilateral
 */
export function validateCorners(
  corners: DetectedCorners,
  imageWidth: number,
  imageHeight: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  
  // Check that corners are within image bounds
  const allCorners = [corners.topLeft, corners.topRight, corners.bottomLeft, corners.bottomRight]
  for (const corner of allCorners) {
    if (corner.x < 0 || corner.x > imageWidth || corner.y < 0 || corner.y > imageHeight) {
      issues.push('Corners outside image bounds')
      break
    }
  }
  
  // Check that top corners are above bottom corners
  if (corners.topLeft.y >= corners.bottomLeft.y || corners.topRight.y >= corners.bottomRight.y) {
    issues.push('Top corners not above bottom corners')
  }
  
  // Check that left corners are left of right corners
  if (corners.topLeft.x >= corners.topRight.x || corners.bottomLeft.x >= corners.bottomRight.x) {
    issues.push('Left corners not left of right corners')
  }
  
  // Check aspect ratio is reasonable (should be close to 850/1100 = 0.773)
  const width = (corners.topRight.x - corners.topLeft.x + corners.bottomRight.x - corners.bottomLeft.x) / 2
  const height = (corners.bottomLeft.y - corners.topLeft.y + corners.bottomRight.y - corners.topRight.y) / 2
  const aspectRatio = width / height
  const expectedRatio = 850 / 1100
  
  if (aspectRatio < expectedRatio * 0.7 || aspectRatio > expectedRatio * 1.3) {
    issues.push(`Aspect ratio ${aspectRatio.toFixed(2)} is too far from expected ${expectedRatio.toFixed(2)}`)
  }
  
  // Check minimum size (at least 30% of image)
  const minArea = (imageWidth * imageHeight) * 0.3
  const detectedArea = width * height
  if (detectedArea < minArea) {
    issues.push('Detected paper too small')
  }
  
  return {
    valid: issues.length === 0,
    issues,
  }
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteArrays = []
  
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512)
    const byteNumbers = new Array(slice.length)
    
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }
    
    byteArrays.push(new Uint8Array(byteNumbers))
  }
  
  return new Blob(byteArrays, { type: mimeType })
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
  
  // Compute homography matrix
  return computeHomography(srcPts, dstPts)
}

function computeHomography(src: number[][], dst: number[][]): number[][] {
  // Simple identity matrix for now
  // Real perspective correction is done server-side with Sharp
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
}
