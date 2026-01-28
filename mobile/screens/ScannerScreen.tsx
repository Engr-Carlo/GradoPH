import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  Animated,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native'
import { CameraView, Camera } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import * as FileSystem from 'expo-file-system/legacy'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { 
  DetectedCorners, 
  getDefaultCorners, 
  checkStability, 
  resetStability,
  Point,
  detectCornersFromServer,
  validateCorners
} from '../lib/cornerDetection'
import { cropToCorners } from '../lib/imageProcessor'
import { PRODUCTION_API_URL, isDevelopment, ALWAYS_USE_PRODUCTION_API } from '../config'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

// Template dimensions: 850×1100px (aspect ratio 0.773)
const TEMPLATE_ASPECT_RATIO = 850 / 1100
const TEMPLATE_WIDTH = 850
const TEMPLATE_HEIGHT = 1100
const MARKER_SIZE = 30 // Larger markers for better visibility
const CORNER_MARKER_INSET = 40 // Distance from template edge where corner markers are

// Calculate responsive template frame that fits screen
const calculateTemplateFrame = () => {
  const availableHeight = screenHeight * 0.65
  const availableWidth = screenWidth * 0.9
  
  let frameWidth, frameHeight
  
  if (availableWidth / availableHeight > TEMPLATE_ASPECT_RATIO) {
    frameHeight = availableHeight
    frameWidth = frameHeight * TEMPLATE_ASPECT_RATIO
  } else {
    frameWidth = availableWidth
    frameHeight = frameWidth / TEMPLATE_ASPECT_RATIO
  }
  
  return {
    width: frameWidth,
    height: frameHeight,
    left: (screenWidth - frameWidth) / 2,
    top: (screenHeight - frameHeight) / 2 - 30,
  }
}

// Scan modes
type ScanMode = 'auto' | 'manual'

// Minimum consecutive good frames needed before auto-capture
const MIN_STABLE_FRAMES = 5

export default function ScannerScreen({ route, navigation }: any) {
  const { exam } = route.params
  const templateFrame = calculateTemplateFrame()
  
  // Camera state
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [processing, setProcessing] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [croppedImage, setCroppedImage] = useState<string | null>(null)
  const cameraRef = useRef<any>(null)
  
  // Scanning state
  const [scanMode, setScanMode] = useState<ScanMode>('manual') // Default to manual for reliability
  const [showGuides, setShowGuides] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Tap capture when paper is aligned')
  
  // Manual entry modal
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualStudentId, setManualStudentId] = useState('')
  const [manualAnswers, setManualAnswers] = useState<string[]>([])
  
  // Scan result display
  const [lastScanResult, setLastScanResult] = useState<any>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  
  // Corner detection state
  const [detectedCorners, setDetectedCorners] = useState<DetectedCorners>(
    getDefaultCorners(templateFrame.width, templateFrame.height, TEMPLATE_ASPECT_RATIO)
  )
  const [paperDetected, setPaperDetected] = useState(false)
  const [isStable, setIsStable] = useState(false)
  const [autoCapturing, setAutoCapturing] = useState(false)
  
  // Animation values for corners
  const cornerAnimations = useRef({
    topLeft: new Animated.ValueXY({ x: 0, y: 0 }),
    topRight: new Animated.ValueXY({ x: 0, y: 0 }),
    bottomLeft: new Animated.ValueXY({ x: 0, y: 0 }),
    bottomRight: new Animated.ValueXY({ x: 0, y: 0 }),
  }).current
  
  // Auto-capture countdown
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    requestPermissions()
    return () => {
      // Cleanup
      if (countdownRef.current) clearTimeout(countdownRef.current)
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current)
      resetStability()
    }
  }, [])

  // Start periodic corner analysis when in auto mode
  useEffect(() => {
    if (scanMode === 'auto' && hasPermission && !capturedImage && !processing) {
      startCornerAnalysis()
    } else {
      stopCornerAnalysis()
    }
    
    return () => stopCornerAnalysis()
  }, [scanMode, hasPermission, capturedImage, processing])

  // Handle corner detection results
  useEffect(() => {
    if (paperDetected && isStable && scanMode === 'auto' && !autoCapturing) {
      startAutoCapture()
    } else if (!isStable && autoCapturing) {
      cancelAutoCapture()
    }
  }, [paperDetected, isStable, scanMode, autoCapturing])

  // Animate corners when detected corners change
  useEffect(() => {
    animateCorners(detectedCorners)
  }, [detectedCorners])

  async function requestPermissions() {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync()
      setHasPermission(status === 'granted')
      
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Please grant camera permission to scan bubble sheets.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Retry', onPress: () => requestPermissions() },
          ]
        )
      }
    } catch (error: any) {
      Alert.alert('Error', error.message)
    }
  }

  function startCornerAnalysis() {
    if (analysisIntervalRef.current) return
    
    // Take actual photos periodically to analyze paper position
    analysisIntervalRef.current = setInterval(() => {
      analyzeFrameForPaper()
    }, 1500) // Check every 1.5 seconds with real photo analysis
  }

  function stopCornerAnalysis() {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current)
      analysisIntervalRef.current = null
    }
  }

  // Track detection stage for smooth progression
  const detectionStageRef = useRef(0)
  const consecutiveGoodFramesRef = useRef(0)

  // Analyze actual camera frames to detect paper positioning
  async function analyzeFrameForPaper() {
    if (processing || capturedImage || !cameraRef.current) return
    
    try {
      // Take a quick low-quality photo for analysis (doesn't trigger shutter)
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.1, // Very low quality for speed
        base64: false,
        skipProcessing: true, // Fastest capture
      })
      
      // Analyze the photo for paper presence
      const analysis = await checkPaperInFrame(photo.uri, photo.width, photo.height)
      
      // Clean up temp photo
      try {
        await FileSystem.deleteAsync(photo.uri, { idempotent: true })
      } catch {}
      
      if (analysis.isPaperDetected) {
        consecutiveGoodFramesRef.current++
        
        if (consecutiveGoodFramesRef.current >= MIN_STABLE_FRAMES) {
          // Paper detected and stable for enough frames - ready for auto-capture
          setPaperDetected(true)
          setIsStable(true)
          setStatusMessage('✅ Paper detected - Ready!')
        } else if (consecutiveGoodFramesRef.current >= 2) {
          // Paper detected, waiting for more stability
          setPaperDetected(true)
          setIsStable(false)
          setStatusMessage(`⏳ Hold steady... (${consecutiveGoodFramesRef.current}/${MIN_STABLE_FRAMES})`)
        } else {
          // Just started detecting
          setPaperDetected(true)
          setIsStable(false)
          setStatusMessage('📄 Paper detected, hold steady...')
        }
        
        // Update corners based on analysis
        setDetectedCorners(analysis.corners)
        
      } else {
        // Paper not properly in frame
        consecutiveGoodFramesRef.current = 0
        setPaperDetected(false)
        setIsStable(false)
        setStatusMessage('📷 Position paper in frame')
        
        // Reset to default corners
        setDetectedCorners(getDefaultCorners(templateFrame.width, templateFrame.height, TEMPLATE_ASPECT_RATIO))
      }
      
    } catch (error) {
      // Silent fail - just continue analyzing
      console.log('Frame analysis error:', error)
    }
  }

  // Check if paper is properly positioned in the frame using server-side detection
  async function checkPaperInFrame(
    imageUri: string,
    imageWidth: number,
    imageHeight: number
  ): Promise<{ isPaperDetected: boolean; corners: DetectedCorners }> {
    // Get base corners for the template frame
    const baseCorners = getDefaultCorners(templateFrame.width, templateFrame.height, TEMPLATE_ASPECT_RATIO)
    
    // Try server-side corner detection for accurate results
    try {
      const result = await detectCornersFromServer(imageUri, imageWidth, imageHeight)
      
      if (result.success && result.corners.confidence >= 60) {
        // Validate the detected corners
        const validation = validateCorners(result.corners, imageWidth, imageHeight)
        
        if (validation.valid) {
          // Scale corners from image coordinates to screen frame coordinates
          const scaleX = templateFrame.width / imageWidth
          const scaleY = templateFrame.height / imageHeight
          
          const scaledCorners: DetectedCorners = {
            topLeft: { 
              x: result.corners.topLeft.x * scaleX, 
              y: result.corners.topLeft.y * scaleY 
            },
            topRight: { 
              x: result.corners.topRight.x * scaleX, 
              y: result.corners.topRight.y * scaleY 
            },
            bottomLeft: { 
              x: result.corners.bottomLeft.x * scaleX, 
              y: result.corners.bottomLeft.y * scaleY 
            },
            bottomRight: { 
              x: result.corners.bottomRight.x * scaleX, 
              y: result.corners.bottomRight.y * scaleY 
            },
            confidence: result.corners.confidence,
            isStable: consecutiveGoodFramesRef.current >= 3,
          }
          
          console.log(`Corner detection: confidence=${result.corners.confidence}%`)
          
          return {
            isPaperDetected: true,
            corners: scaledCorners,
          }
        } else {
          console.log('Corner validation failed:', validation.issues)
          // Return not detected if validation fails
          return {
            isPaperDetected: false,
            corners: baseCorners,
          }
        }
      } else {
        // Server detection returned low confidence
        console.log('Server detection low confidence:', result.corners?.confidence || 0)
      }
    } catch (error) {
      console.log('Server corner detection error:', error)
    }
    
    // Fallback: Return NOT detected - don't fake it
    // User needs to position paper properly or use manual mode
    return {
      isPaperDetected: false,
      corners: baseCorners,
    }
  }

  // Reset detection stage when scanner is reset
  function resetDetectionStage() {
    detectionStageRef.current = 0
    consecutiveGoodFramesRef.current = 0
    resetStability()
  }

  // Legacy function - no longer takes photos to prevent flickering
  async function analyzeFrame() {
    // Replaced by simulateSmoothDetection()
  }

  // Simulated paper detection - kept for future ML Kit integration
  async function simulatePaperDetection(imageUri: string): Promise<{
    isPaperDetected: boolean
    corners: DetectedCorners
    isStable: boolean
  }> {
    // For future use with real ML detection
    
    const baseCorners = getDefaultCorners(
      templateFrame.width, 
      templateFrame.height, 
      TEMPLATE_ASPECT_RATIO
    )
    
    // Simulate corner detection with slight variations
    const jitter = () => (Math.random() - 0.5) * 10
    
    const detectedCorners: DetectedCorners = {
      topLeft: { 
        x: baseCorners.topLeft.x + jitter(), 
        y: baseCorners.topLeft.y + jitter() 
      },
      topRight: { 
        x: baseCorners.topRight.x + jitter(), 
        y: baseCorners.topRight.y + jitter() 
      },
      bottomLeft: { 
        x: baseCorners.bottomLeft.x + jitter(), 
        y: baseCorners.bottomLeft.y + jitter() 
      },
      bottomRight: { 
        x: baseCorners.bottomRight.x + jitter(), 
        y: baseCorners.bottomRight.y + jitter() 
      },
      confidence: 75 + Math.random() * 20,
      isStable: false,
    }
    
    // Simulate paper being detected most of the time
    const isPaperDetected = Math.random() > 0.3
    
    return {
      isPaperDetected,
      corners: detectedCorners,
      isStable: isPaperDetected && checkStability(detectedCorners),
    }
  }

  function animateCorners(corners: DetectedCorners) {
    const duration = 150 // Fast animation for responsiveness
    
    // Convert corner positions relative to template frame
    const getScreenPosition = (corner: Point) => ({
      x: templateFrame.left + corner.x,
      y: templateFrame.top + corner.y,
    })
    
    Animated.parallel([
      Animated.timing(cornerAnimations.topLeft, {
        toValue: getScreenPosition(corners.topLeft),
        duration,
        useNativeDriver: false,
      }),
      Animated.timing(cornerAnimations.topRight, {
        toValue: getScreenPosition(corners.topRight),
        duration,
        useNativeDriver: false,
      }),
      Animated.timing(cornerAnimations.bottomLeft, {
        toValue: getScreenPosition(corners.bottomLeft),
        duration,
        useNativeDriver: false,
      }),
      Animated.timing(cornerAnimations.bottomRight, {
        toValue: getScreenPosition(corners.bottomRight),
        duration,
        useNativeDriver: false,
      }),
    ]).start()
  }

  function startAutoCapture() {
    setAutoCapturing(true)
    setCountdown(3)
    setStatusMessage('Capturing in 3...')
    
    let count = 3
    countdownRef.current = setInterval(() => {
      count--
      if (count > 0) {
        setCountdown(count)
        setStatusMessage(`Capturing in ${count}...`)
      } else {
        clearInterval(countdownRef.current!)
        countdownRef.current = null
        setCountdown(null)
        handleCapture()
      }
    }, 1000)
  }

  function cancelAutoCapture() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setAutoCapturing(false)
    setCountdown(null)
    setStatusMessage('Paper moved - realigning...')
  }

  async function handleCapture() {
    if (processing || !cameraRef.current) return
    
    setProcessing(true)
    stopCornerAnalysis()
    setStatusMessage('Capturing...')

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
      })

      // Apply perspective transform / crop
      setStatusMessage('Processing image...')
      
      // Calculate corners in image coordinates (scale from screen to image)
      const scaleX = photo.width / screenWidth
      const scaleY = photo.height / screenHeight
      
      const imageCorners: DetectedCorners = {
        topLeft: { 
          x: (templateFrame.left + detectedCorners.topLeft.x) * scaleX, 
          y: (templateFrame.top + detectedCorners.topLeft.y) * scaleY 
        },
        topRight: { 
          x: (templateFrame.left + detectedCorners.topRight.x) * scaleX, 
          y: (templateFrame.top + detectedCorners.topRight.y) * scaleY 
        },
        bottomLeft: { 
          x: (templateFrame.left + detectedCorners.bottomLeft.x) * scaleX, 
          y: (templateFrame.top + detectedCorners.bottomLeft.y) * scaleY 
        },
        bottomRight: { 
          x: (templateFrame.left + detectedCorners.bottomRight.x) * scaleX, 
          y: (templateFrame.top + detectedCorners.bottomRight.y) * scaleY 
        },
        confidence: detectedCorners.confidence,
        isStable: detectedCorners.isStable,
      }
      
      // Crop to detected paper region
      const cropped = await cropToCorners(
        photo.uri,
        imageCorners,
        photo.width,
        photo.height,
        TEMPLATE_WIDTH,
        TEMPLATE_HEIGHT
      )
      
      setCapturedImage(photo.uri)
      setCroppedImage(cropped.uri)
      setProcessing(false)
      setAutoCapturing(false)
      
    } catch (error: any) {
      Alert.alert('Capture Error', error.message)
      setProcessing(false)
      setAutoCapturing(false)
      if (scanMode === 'auto') startCornerAnalysis()
    }
  }

  async function processAndUpload() {
    if (!croppedImage && !capturedImage) {
      Alert.alert('Error', 'No image captured')
      return
    }

    setProcessing(true)
    setStatusMessage('Uploading...')

    try {
      const storedThreshold = await AsyncStorage.getItem('bubble_threshold_override')
      const bubbleThreshold = storedThreshold ? parseInt(storedThreshold, 10) : 50

      const timestamp = Date.now()
      const fileName = `scan_${exam.id}_${timestamp}.jpg`
      const filePath = `${exam.id}/${fileName}`

      // Use cropped image if available, otherwise use original
      const imageToUpload = croppedImage || capturedImage!
      
      const base64 = await FileSystem.readAsStringAsync(imageToUpload, {
        encoding: 'base64',
      })

      const decode = (str: string) => {
        const binary = atob(str)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        return bytes
      }

      const imageBytes = decode(base64)

      setStatusMessage('Uploading to server...')
      
      const { error: uploadError } = await supabase.storage
        .from('scan-images')
        .upload(filePath, imageBytes, {
          contentType: 'image/jpeg',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      setStatusMessage('Processing OMR...')

      const { data: session } = await supabase.auth.getSession()
      if (!session.session) {
        throw new Error('Not authenticated')
      }

      const getWebApiUrl = () => {
        // Force production API if flag is set
        if (ALWAYS_USE_PRODUCTION_API) {
          return PRODUCTION_API_URL
        }
        
        // Production mode: Use Vercel URL
        if (!isDevelopment) {
          return PRODUCTION_API_URL
        }
        
        // Development mode: Auto-detect local IP
        const debuggerHost = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost
        if (debuggerHost) {
          const host = debuggerHost.split(':').shift()
          return `http://${host}:3000`
        }
        return 'http://localhost:3000'
      }

      const webApiUrl = getWebApiUrl()
      console.log('Using API URL:', webApiUrl, ALWAYS_USE_PRODUCTION_API ? '(forced production)' : (isDevelopment ? '(dev mode)' : '(production mode)'))
      
      const response = await fetch(`${webApiUrl}/api/scans/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          exam_id: exam.id,
          image_path: filePath,
          bubble_threshold: bubbleThreshold,
        }),
      })

      const result = await response.json()
      
      console.log('=== SCAN RESULT ===')
      console.log('Success:', result.success)
      console.log('Confidence:', result.confidence)
      console.log('Student ID:', result.student_id)
      console.log('Score:', result.score, '/', result.total_questions)

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'Processing failed')
      }

      // Check if exam matches
      if (result.metadata?.exam_code_hash && exam.exam_code_hash && 
          result.metadata.exam_code_hash !== exam.exam_code_hash) {
        Alert.alert(
          'Wrong Exam Sheet',
          `The scanned sheet is for a different exam.\n\nExpected: ${exam.name}`,
          [{ text: 'OK', onPress: resetScanner }]
        )
        return
      }

      // Store result for display
      setLastScanResult(result)

      // Always show results, but warn if low confidence
      if (result.confidence < 40) {
        // Very low confidence - offer manual entry
        Alert.alert(
          '⚠️ Low Confidence Detection',
          `Student ID: ${result.student_id || 'Not detected'}\nConfidence: ${result.confidence}%\n\nThe scan quality is too low. Would you like to enter data manually?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: resetScanner },
            { text: 'Use Anyway', onPress: () => setShowResultModal(true) },
            { text: 'Manual Entry', onPress: () => {
              setManualStudentId(result.student_id || '')
              setShowManualEntry(true)
            }}
          ]
        )
      } else if (result.confidence < 70) {
        // Medium confidence - show results but warn
        Alert.alert(
          '📋 Scan Results (Review Recommended)',
          `Student ID: ${result.student_id || 'Unknown'}\nScore: ${result.score ?? 0}/${result.total_questions ?? exam.answer_key_json?.length ?? '?'}\nConfidence: ${result.confidence}%\n\nPlease verify the results are correct.`,
          [
            { text: 'Retry', onPress: resetScanner },
            { text: 'View Details', onPress: () => setShowResultModal(true) },
            { text: 'Accept', style: 'default', onPress: () => navigation.goBack() }
          ]
        )
      } else {
        // Good confidence - show success
        Alert.alert(
          '✅ Scan Complete!',
          `Student ID: ${result.student_id}\nScore: ${result.score ?? 0}/${result.total_questions ?? exam.answer_key_json?.length ?? '?'}\nConfidence: ${result.confidence}%`,
          [
            { text: 'View Details', onPress: () => setShowResultModal(true) },
            { text: 'Done', style: 'default', onPress: () => navigation.goBack() }
          ]
        )
      }
    } catch (error: any) {
      console.error('Processing error:', error)
      Alert.alert(
        'Processing Failed', 
        error.message || 'Unknown error',
        [
          { text: 'Cancel', onPress: () => navigation.goBack() },
          { text: 'Retry', onPress: resetScanner },
          { text: 'Manual Entry', onPress: () => setShowManualEntry(true) }
        ]
      )
    } finally {
      setProcessing(false)
    }
  }

  function resetScanner() {
    setCapturedImage(null)
    setCroppedImage(null)
    setProcessing(false)
    setAutoCapturing(false)
    setCountdown(null)
    setPaperDetected(false)
    setIsStable(false)
    setStatusMessage('Position paper in frame')
    resetStability()
    resetDetectionStage() // Reset the smooth detection stage
    if (scanMode === 'auto') startCornerAnalysis()
  }

  // Pick image from gallery for manual upload
  async function pickImageFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        base64: true,
      })

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        console.log('Image picked:', asset.width, 'x', asset.height)
        
        // Set as captured image and process
        setCapturedImage(asset.uri)
        setStatusMessage('Processing selected image...')
        
        // Process the image directly
        if (asset.base64) {
          await processImage(asset.uri, asset.base64)
        } else {
          Alert.alert('Error', 'Could not read image data')
        }
      }
    } catch (error) {
      console.error('Image picker error:', error)
      Alert.alert('Error', 'Failed to pick image from gallery')
    }
  }

  function toggleScanMode() {
    const newMode = scanMode === 'auto' ? 'manual' : 'auto'
    setScanMode(newMode)
    cancelAutoCapture()
    resetStability()
    setStatusMessage(newMode === 'auto' ? 'Position paper in frame' : 'Manual mode - tap to capture')
  }

  // Render corner marker
  const renderCornerMarker = (
    position: Animated.ValueXY, 
    corner: 'tl' | 'tr' | 'bl' | 'br'
  ) => {
    const isAligned = paperDetected && isStable
    
    return (
      <Animated.View
        style={[
          styles.cornerMarker,
          {
            left: position.x,
            top: position.y,
            backgroundColor: isAligned ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.3)',
            borderColor: isAligned ? '#10b981' : '#ef4444',
          },
          corner === 'tl' && { borderTopWidth: 3, borderLeftWidth: 3 },
          corner === 'tr' && { borderTopWidth: 3, borderRightWidth: 3 },
          corner === 'bl' && { borderBottomWidth: 3, borderLeftWidth: 3 },
          corner === 'br' && { borderBottomWidth: 3, borderRightWidth: 3 },
        ]}
      />
    )
  }

  if (hasPermission === null) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermissions}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {capturedImage ? (
        // Preview captured/cropped image
        <View style={styles.previewContainer}>
          <Image 
            source={{ uri: croppedImage || capturedImage }} 
            style={styles.preview} 
          />
          
          {/* Cropped indicator */}
          {croppedImage && (
            <View style={styles.croppedBadge}>
              <Text style={styles.croppedBadgeText}>✓ Auto-cropped</Text>
            </View>
          )}
          
          <View style={styles.previewOverlay}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={resetScanner}
              disabled={processing}
            >
              <Text style={styles.buttonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, processing && styles.buttonDisabled]}
              onPress={processAndUpload}
              disabled={processing}
            >
              <Text style={styles.buttonText}>
                {processing ? 'Processing...' : 'Confirm & Process'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // Camera view
        <>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
          />

          <View style={styles.overlay}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={[styles.modeButton, scanMode === 'auto' && styles.modeButtonActive]}
                  onPress={toggleScanMode}
                >
                  <Text style={styles.buttonText}>
                    {scanMode === 'auto' ? '🤖 Auto' : '👆 Manual'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Template frame and dynamic corners */}
            {showGuides && (
              <>
                {/* Template boundary */}
                <View style={[
                  styles.templateFrame,
                  {
                    width: templateFrame.width,
                    height: templateFrame.height,
                    left: templateFrame.left,
                    top: templateFrame.top,
                    borderColor: paperDetected ? 
                      (isStable ? '#10b981' : '#fbbf24') : 
                      'rgba(255,255,255,0.3)',
                  }
                ]} />
                
                {/* Dynamic corner markers */}
                {renderCornerMarker(cornerAnimations.topLeft, 'tl')}
                {renderCornerMarker(cornerAnimations.topRight, 'tr')}
                {renderCornerMarker(cornerAnimations.bottomLeft, 'bl')}
                {renderCornerMarker(cornerAnimations.bottomRight, 'br')}
              </>
            )}

            {/* Status and countdown */}
            <View style={styles.statusContainer}>
              <View style={[
                styles.statusBadge,
                paperDetected && styles.statusBadgeDetected,
                isStable && styles.statusBadgeStable,
              ]}>
                <Text style={styles.statusText}>{statusMessage}</Text>
              </View>
              
              {countdown !== null && (
                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.examInfo}>
                {exam.name} • {exam.num_questions || 0} questions
              </Text>
              
              {/* Buttons row */}
              <View style={styles.buttonRow}>
                {/* Gallery button */}
                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={pickImageFromGallery}
                  disabled={processing}
                >
                  <Text style={styles.galleryButtonText}>📁</Text>
                </TouchableOpacity>
                
                {/* Manual capture button - always visible */}
                <TouchableOpacity
                  style={[
                    styles.captureButton,
                    processing && styles.captureButtonDisabled,
                  ]}
                  onPress={handleCapture}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <View style={styles.captureButtonInner} />
                  )}
                </TouchableOpacity>
                
                {/* Manual entry button */}
                <TouchableOpacity
                  style={styles.manualEntryButton}
                  onPress={() => setShowManualEntry(true)}
                  disabled={processing}
                >
                  <Text style={styles.galleryButtonText}>✏️</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.hint}>
                {scanMode === 'auto' 
                  ? 'Auto-capture when paper is aligned • Or tap to capture manually'
                  : '📁 Gallery | ⭕ Capture | ✏️ Manual Entry'}
              </Text>
            </View>
          </View>

          {/* Result Modal */}
          <Modal
            visible={showResultModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowResultModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Scan Results</Text>
                
                {lastScanResult && (
                  <ScrollView style={styles.resultScroll}>
                    <Text style={styles.resultText}>
                      Student ID: {lastScanResult.student_id || 'Not detected'}
                    </Text>
                    <Text style={styles.resultText}>
                      Score: {lastScanResult.score ?? 0}/{lastScanResult.total_questions ?? '?'}
                    </Text>
                    <Text style={styles.resultText}>
                      Confidence: {lastScanResult.confidence}%
                    </Text>
                    
                    {lastScanResult.answers && (
                      <>
                        <Text style={styles.resultLabel}>Detected Answers:</Text>
                        <Text style={styles.answersText}>
                          {lastScanResult.answers.map((a: string, i: number) => 
                            `${i+1}:${a || '-'}`
                          ).join('  ')}
                        </Text>
                      </>
                    )}
                  </ScrollView>
                )}
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalButtonSecondary}
                    onPress={() => {
                      setShowResultModal(false)
                      resetScanner()
                    }}
                  >
                    <Text style={styles.buttonText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalButtonPrimary}
                    onPress={() => {
                      setShowResultModal(false)
                      navigation.goBack()
                    }}
                  >
                    <Text style={styles.buttonText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Manual Entry Modal */}
          <Modal
            visible={showManualEntry}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowManualEntry(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Manual Entry</Text>
                
                <Text style={styles.inputLabel}>Student ID:</Text>
                <TextInput
                  style={styles.textInput}
                  value={manualStudentId}
                  onChangeText={setManualStudentId}
                  placeholder="Enter student ID"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                />
                
                <Text style={styles.inputLabel}>Answers (comma separated):</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={manualAnswers}
                  onChangeText={setManualAnswers}
                  placeholder="A,B,C,D,A,B,C,D..."
                  placeholderTextColor="#999"
                  multiline
                />
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalButtonSecondary}
                    onPress={() => setShowManualEntry(false)}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalButtonPrimary}
                    onPress={() => {
                      // TODO: Submit manual entry
                      Alert.alert('Submitted', `Student: ${manualStudentId}\nAnswers: ${manualAnswers}`)
                      setShowManualEntry(false)
                      navigation.goBack()
                    }}
                  >
                    <Text style={styles.buttonText}>Submit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modeButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.8)',
  },
  templateFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  cornerMarker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    marginLeft: -MARKER_SIZE / 2,
    marginTop: -MARKER_SIZE / 2,
  },
  statusContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  statusBadgeDetected: {
    borderColor: '#fbbf24',
  },
  statusBadgeStable: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  countdownContainer: {
    marginTop: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  footer: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  examInfo: {
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 16,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
    resizeMode: 'contain',
  },
  croppedBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  croppedBadgeText: {
    color: '#fff',
    fontWeight: '600',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  retakeButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  confirmButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  permissionText: {
    fontSize: 18,
    color: '#9ca3af',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  manualEntryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  galleryButtonText: {
    fontSize: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  resultScroll: {
    maxHeight: 300,
    marginBottom: 16,
  },
  resultText: {
    color: '#e5e7eb',
    fontSize: 16,
    marginBottom: 8,
  },
  resultLabel: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  answersText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButtonPrimary: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    flex: 1,
    backgroundColor: '#4b5563',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  inputLabel: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: '#374151',
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  textInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
})
