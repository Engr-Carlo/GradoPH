/**
 * Image Processor Module
 * Handles perspective transform and image cropping for scanned papers
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Point, DetectedCorners } from './cornerDetection'

export interface CropResult {
  uri: string
  width: number
  height: number
}

/**
 * Crop and transform image based on detected corners
 * Since React Native doesn't have native perspective transform,
 * we use a simplified crop-to-bounds approach
 */
export async function cropToCorners(
  imageUri: string,
  corners: DetectedCorners,
  imageWidth: number,
  imageHeight: number,
  targetWidth: number = 850,
  targetHeight: number = 1100
): Promise<CropResult> {
  // Calculate bounding box of the detected corners
  const minX = Math.min(corners.topLeft.x, corners.bottomLeft.x)
  const maxX = Math.max(corners.topRight.x, corners.bottomRight.x)
  const minY = Math.min(corners.topLeft.y, corners.topRight.y)
  const maxY = Math.max(corners.bottomLeft.y, corners.bottomRight.y)
  
  // Ensure bounds are within image
  const cropX = Math.max(0, Math.floor(minX))
  const cropY = Math.max(0, Math.floor(minY))
  const cropWidth = Math.min(imageWidth - cropX, Math.ceil(maxX - minX))
  const cropHeight = Math.min(imageHeight - cropY, Math.ceil(maxY - minY))
  
  try {
    // First crop to the bounding box
    const cropped = await manipulateAsync(
      imageUri,
      [
        {
          crop: {
            originX: cropX,
            originY: cropY,
            width: cropWidth,
            height: cropHeight,
          },
        },
        {
          resize: {
            width: targetWidth,
            height: targetHeight,
          },
        },
      ],
      { format: SaveFormat.JPEG, compress: 0.9 }
    )
    
    return {
      uri: cropped.uri,
      width: targetWidth,
      height: targetHeight,
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
