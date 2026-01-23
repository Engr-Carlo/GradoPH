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
} from 'react-native'
import { CameraView, Camera } from 'expo-camera'
import { supabase } from '../lib/supabase'
import * as FileSystem from 'expo-file-system/legacy'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { 
  DetectedCorners, 
  getDefaultCorners, 
  checkStability, 
  resetStability,
  Point 
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
  const [scanMode, setScanMode] = useState<ScanMode>('auto')
  const [showGuides, setShowGuides] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Position paper in frame')
  
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
    
    // Smooth status updates without taking photos (prevents flickering)
    analysisIntervalRef.current = setInterval(() => {
      simulateSmoothDetection()
    }, 1000) // Update every 1 second, no photo taking
  }

  function stopCornerAnalysis() {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current)
      analysisIntervalRef.current = null
    }
  }

  // Track detection stage for smooth progression
  const detectionStageRef = useRef(0)

  // Smooth detection simulation without taking actual photos
  function simulateSmoothDetection() {
    if (processing || capturedImage) return
    
    // Progress through stages smoothly
    const stages = [
      { message: '📷 Position paper in frame', detected: false, stable: false },
      { message: '📄 Paper detected...', detected: true, stable: false },
      { message: '🔄 Aligning corners...', detected: true, stable: false },
      { message: '⏳ Hold steady...', detected: true, stable: false },
      { message: '✅ Ready to capture!', detected: true, stable: true },
    ]
    
    // Gradually progress through stages
    detectionStageRef.current = Math.min(detectionStageRef.current + 1, stages.length - 1)
    const currentStage = stages[detectionStageRef.current]
    
    setPaperDetected(currentStage.detected)
    setStatusMessage(currentStage.message)
    
    if (currentStage.detected) {
      const baseCorners = getDefaultCorners(templateFrame.width, templateFrame.height, TEMPLATE_ASPECT_RATIO)
      
      // Very gentle corner animation (minimal movement)
      const gentleJitter = () => (Math.random() - 0.5) * 2
      
      const smoothCorners: DetectedCorners = {
        topLeft: { x: baseCorners.topLeft.x + gentleJitter(), y: baseCorners.topLeft.y + gentleJitter() },
        topRight: { x: baseCorners.topRight.x + gentleJitter(), y: baseCorners.topRight.y + gentleJitter() },
        bottomLeft: { x: baseCorners.bottomLeft.x + gentleJitter(), y: baseCorners.bottomLeft.y + gentleJitter() },
        bottomRight: { x: baseCorners.bottomRight.x + gentleJitter(), y: baseCorners.bottomRight.y + gentleJitter() },
        confidence: 85,
        isStable: currentStage.stable,
      }
      
      setDetectedCorners(smoothCorners)
      
      if (currentStage.stable) {
        const stable = checkStability(smoothCorners)
        setIsStable(stable)
      } else {
        setIsStable(false)
      }
    } else {
      setIsStable(false)
    }
  }

  // Reset detection stage when scanner is reset
  function resetDetectionStage() {
    detectionStageRef.current = 0
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

      // Check confidence
      if (result.confidence < 60) {
        const newRetryCount = retryCount + 1
        setRetryCount(newRetryCount)
        
        if (newRetryCount < 3) {
          Alert.alert(
            'Low Confidence',
            `Detection confidence: ${result.confidence}%\n\nTry better lighting or alignment.\n\nRetry ${newRetryCount}/3`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
              { text: 'Retry', onPress: resetScanner }
            ]
          )
        } else {
          Alert.alert(
            'Detection Issues',
            'Would you like to enter student ID manually?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
              { text: 'Manual Entry', onPress: () => {
                Alert.alert('Manual Entry', 'Not implemented yet')
              }}
            ]
          )
        }
        return
      }

      // Success!
      Alert.alert(
        '✅ Scan Complete!',
        `Student ID: ${result.student_id}\nScore: ${result.score}/${result.total_questions}\nConfidence: ${result.confidence}%`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (error: any) {
      console.error('Processing error:', error)
      Alert.alert('Processing Failed', error.message || 'Unknown error')
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
              
              <Text style={styles.hint}>
                {scanMode === 'auto' 
                  ? 'Auto-capture when paper is aligned • Or tap to capture manually'
                  : 'Tap the button to capture'}
              </Text>
            </View>
          </View>
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
    marginBottom: 12,
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
})
