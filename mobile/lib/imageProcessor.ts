/**
 * Image Processor Module
 * Handles perspective transform and image cropping for scanned papers
 */

import { manipulateAsync, SaveFormat, FlipType } from 'expo-image-manipulator'
import { Point, DetectedCorners } from './cornerDetection'

export interface CropResult {
  uri: string
  width: number
  height: number
}

/**
 * Crop and transform image based on detected corners
 * Handles orientation correction - NO STRETCHING
 */
export async function cropToCorners(
  imageUri: string,
  corners: DetectedCorners,
  imageWidth: number,
  imageHeight: number,
  targetWidth: number = 850,
  targetHeight: number = 1100
): Promise<CropResult> {
  // Calculate bounding box of the detected corners with padding
  const padding = 20 // Add padding to avoid cutting edges
  const minX = Math.min(corners.topLeft.x, corners.bottomLeft.x) - padding
  const maxX = Math.max(corners.topRight.x, corners.bottomRight.x) + padding
  const minY = Math.min(corners.topLeft.y, corners.topRight.y) - padding
  const maxY = Math.max(corners.bottomLeft.y, corners.bottomRight.y) + padding
  
  // Ensure bounds are within image
  const cropX = Math.max(0, Math.floor(minX))
  const cropY = Math.max(0, Math.floor(minY))
  const cropWidth = Math.min(imageWidth - cropX, Math.ceil(maxX - minX))
  const cropHeight = Math.min(imageHeight - cropY, Math.ceil(maxY - minY))
  
  try {
    // Determine if the image is in landscape orientation (wider than tall)
    const isLandscape = cropWidth > cropHeight * 1.2
    
    // Build manipulation actions
    const actions: any[] = []
    
    // First crop to the bounding box
    actions.push({
      crop: {
        originX: cropX,
        originY: cropY,
        width: cropWidth,
        height: cropHeight,
      },
    })
    
    // If landscape, rotate to portrait
    if (isLandscape) {
      actions.push({ rotate: -90 })
    }
    
    // DO NOT resize/stretch - let the server handle that
    // The OMR processor will resize to 850x1100 on the server
    
    const result = await manipulateAsync(
      imageUri,
      actions,
      { format: SaveFormat.JPEG, compress: 0.9 }
    )
    
    // Return the actual dimensions after cropping (and possible rotation)
    const finalWidth = isLandscape ? cropHeight : cropWidth
    const finalHeight = isLandscape ? cropWidth : cropHeight
    
    return {
      uri: result.uri,
      width: finalWidth,
      height: finalHeight,
    }
  } catch (error) {
    console.error('Error cropping image:', error)
    // Return original if cropping fails
    return {
      uri: imageUri,
      width: imageWidth,
      height: imageHeight,
    }
  }
}

/**
 * Simple paper detection based on brightness
 * Returns confidence 0-100 of paper detection
 */
export function detectPaperPresence(
  brightness: number,
  contrast: number
): number {
  // Paper is typically bright (high brightness) with good contrast
  // This is a heuristic - adjust thresholds based on testing
  const brightnessScore = Math.min(100, brightness * 1.2)
  const contrastScore = Math.min(100, contrast * 0.8)
  
  return Math.floor((brightnessScore + contrastScore) / 2)
}

/**
 * Analyze image for paper corners using simple edge detection
 * This is a placeholder - for production, use ML Kit or OpenCV
 */
export async function analyzeImageForCorners(
  imageUri: string,
  frameWidth: number,
  frameHeight: number
): Promise<DetectedCorners | null> {
  // In a real implementation, this would:
  // 1. Load the image
  // 2. Convert to grayscale
  // 3. Apply Canny edge detection
  // 4. Find contours
  // 5. Find the largest rectangular contour
  // 6. Return the 4 corners
  
  // For now, return null to indicate we should use default corners
  return null
}
