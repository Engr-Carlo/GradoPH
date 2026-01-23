import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native'
import { CameraView, Camera } from 'expo-camera'
import { supabase } from '../lib/supabase'
import * as FileSystem from 'expo-file-system/legacy'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

// Template dimensions: 850×1100px (aspect ratio 0.773)
const TEMPLATE_ASPECT_RATIO = 850 / 1100
const MARKER_SIZE = 22 // Corner marker size in template
const MARKER_INSET = 40 // Distance from template edge

// Calculate responsive template frame that fits screen
const calculateTemplateFrame = () => {
  const availableHeight = screenHeight * 0.7 // Use 70% of screen for scan area
  const availableWidth = screenWidth * 0.85 // Use 85% of screen width
  
  let frameWidth, frameHeight
  
  if (availableWidth / availableHeight > TEMPLATE_ASPECT_RATIO) {
    // Height constrained
    frameHeight = availableHeight
    frameWidth = frameHeight * TEMPLATE_ASPECT_RATIO
  } else {
    // Width constrained
    frameWidth = availableWidth
    frameHeight = frameWidth / TEMPLATE_ASPECT_RATIO
  }
  
  return {
    width: frameWidth,
    height: frameHeight,
    left: (screenWidth - frameWidth) / 2,
    top: (screenHeight - frameHeight) / 2,
  }
}

export default function ScannerScreen({ route, navigation }: any) {
  const { exam } = route.params
  const templateFrame = calculateTemplateFrame()
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [processing, setProcessing] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showGuides, setShowGuides] = useState(true)
  const cameraRef = useRef<any>(null)

  useEffect(() => {
    requestPermissions()
  }, [])

  async function requestPermissions() {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync()
      console.log('Camera permission status:', status)
      setHasPermission(status === 'granted')
      
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Please grant camera permission to scan bubble sheets.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => requestPermissions() },
          ]
        )
      }
    } catch (error: any) {
      console.error('Permission error:', error)
      Alert.alert('Error', error.message)
    }
  }

  async function handleCapture() {
    if (processing || !cameraRef.current) return
    
    setProcessing(true)

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      })

      setCapturedImage(photo.uri)
      setProcessing(false)
      
    } catch (error: any) {
      Alert.alert('Error', error.message)
      setProcessing(false)
    }
  }

  async function processAndUpload() {
    if (!capturedImage) {
      Alert.alert('Error', 'No image captured')
      return
    }

    setProcessing(true)

    try {
      // Get calibrated bubble threshold from AsyncStorage
      const storedThreshold = await AsyncStorage.getItem('bubble_threshold_override')
      const bubbleThreshold = storedThreshold ? parseInt(storedThreshold, 10) : 50

      // 1. Upload image to Supabase Storage
      const timestamp = Date.now()
      const fileName = `scan_${exam.id}_${timestamp}.jpg`
      const filePath = `${exam.id}/${fileName}`

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(capturedImage, {
        encoding: 'base64',
      })

      // Decode base64 to binary for upload
      const decode = (str: string) => {
        const binary = atob(str)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        return bytes
      }

      const imageBytes = decode(base64)

      // Upload to storage using ArrayBuffer
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('scan-images')
        .upload(filePath, imageBytes, {
          contentType: 'image/jpeg',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // 2. Call processing API with bubble threshold
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) {
        throw new Error('Not authenticated')
      }

      // Auto-detect web API URL based on environment
      const getWebApiUrl = () => {
        // For Expo Go on physical device, use your computer's IP
        const manifest = Constants.expoConfig
        const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost
        
        if (debuggerHost) {
          const host = debuggerHost.split(':').shift()
          const apiUrl = `http://${host}:3000` // Changed to port 3000
          console.log('Auto-detected API URL:', apiUrl)
          return apiUrl
        }
        
        // Fallback for emulator
        console.log('Using fallback localhost:3000')
        return 'http://localhost:3000'
      }

      let result
      
      try {
        const webApiUrl = getWebApiUrl()
        console.log('Using API URL:', webApiUrl)
        
        const response = await fetch(
          `${webApiUrl}/api/scans/process`,
          {
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
          }
        )

        result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || result.message || 'Processing failed')
        }
      } catch (fetchError: any) {
        console.error('Processing API error:', fetchError)
        throw new Error(`Processing failed: ${fetchError.message}. Make sure the web server is running on localhost:3000`)
      }

      // Check if exam matches
      if (result.metadata?.exam_code_hash && exam.exam_code_hash && 
          result.metadata.exam_code_hash !== exam.exam_code_hash) {
        Alert.alert(
          'Wrong Exam Sheet',
          `The scanned sheet is for a different exam.\n\nExpected: ${exam.name}\n\nPlease use the correct answer sheet.`,
          [{ text: 'OK', onPress: () => {
            setCapturedImage(null)
            setProcessing(false)
          }}]
        )
        return
      }

      // Check confidence level
      if (result.confidence < 60) {
        const newRetryCount = retryCount + 1
        setRetryCount(newRetryCount)
        
        if (newRetryCount < 3) {
          // Show retry with guidance
          Alert.alert(
            'Low Confidence Detection',
            `Detection confidence: ${result.confidence}%\n\nTry:\n• Moving closer to the sheet\n• Better lighting\n• Aligning all 4 corners\n\nRetry ${newRetryCount}/3`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
              { text: 'Retry', onPress: () => {
                setCapturedImage(null)
                setProcessing(false)
              }}
            ]
          )
        } else {
          // Allow manual fallback after 3 retries
          Alert.alert(
            'Detection Issues',
            'Would you like to enter student ID manually?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
              { text: 'Manual Entry', onPress: () => {
                // TODO: Navigate to manual entry screen
                Alert.alert('Manual Entry', 'Manual entry screen not implemented yet')
              }}
            ]
          )
        }
        return
      }

      // Show results
      Alert.alert(
        'Scan Complete!',
        `Student ID: ${result.student_id}\nScore: ${result.score}/${result.total_questions}\nConfidence: ${result.confidence}%`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      )
    } catch (error: any) {
      console.error('Processing error:', error)
      Alert.alert('Processing Failed', error.message || 'Unknown error occurred')
    } finally {
      setProcessing(false)
    }
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

  console.log('Rendering camera. Has permission:', hasPermission)

  return (
    <View style={styles.container}>
      {capturedImage ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.preview} />
          <View style={styles.previewOverlay}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => {
                setCapturedImage(null)
                setProcessing(false)
              }}
            >
              <Text style={styles.buttonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
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
        <>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
          />

          <View style={styles.overlay}>
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.guidesButton}
                onPress={() => setShowGuides(!showGuides)}
              >
                <Text style={styles.buttonText}>{showGuides ? 'Hide' : 'Show'} Guides</Text>
              </TouchableOpacity>
            </View>

            {/* Template frame outline */}
            {showGuides && (
              <>
                {/* Template boundary box */}
                <View style={[
                  styles.templateFrame,
                  {
                    width: templateFrame.width,
                    height: templateFrame.height,
                    left: templateFrame.left,
                    top: templateFrame.top,
                  }
                ]} />
                
                {/* Corner alignment guides - responsive to template size */}
                {/* Top-left corner */}
                <View style={[
                  styles.cornerGuide,
                  {
                    top: templateFrame.top + (MARKER_INSET * templateFrame.height / 1100),
                    left: templateFrame.left + (MARKER_INSET * templateFrame.width / 850),
                  }
                ]} />
                
                {/* Top-right corner */}
                <View style={[
                  styles.cornerGuide,
                  {
                    top: templateFrame.top + (MARKER_INSET * templateFrame.height / 1100),
                    right: screenWidth - (templateFrame.left + templateFrame.width) + (MARKER_INSET * templateFrame.width / 850),
                  }
                ]} />
                
                {/* Bottom-left corner */}
                <View style={[
                  styles.cornerGuide,
                  {
                    bottom: screenHeight - (templateFrame.top + templateFrame.height) + (MARKER_INSET * templateFrame.height / 1100),
                    left: templateFrame.left + (MARKER_INSET * templateFrame.width / 850),
                  }
                ]} />
                
                {/* Bottom-right corner */}
                <View style={[
                  styles.cornerGuide,
                  {
                    bottom: screenHeight - (templateFrame.top + templateFrame.height) + (MARKER_INSET * templateFrame.height / 1100),
                    right: screenWidth - (templateFrame.left + templateFrame.width) + (MARKER_INSET * templateFrame.width / 850),
                  }
                ]} />

                {/* Position guides */}
                <View style={[styles.guideOverlay, { top: templateFrame.top + templateFrame.height + 10 }]}>
                  <Text style={styles.guideLabel}>Align sheet corners with green markers</Text>
                </View>
              </>
            )}

            <View style={styles.footer}>
              <Text style={styles.instructions}>
                Align all 4 green corners with the sheet markers{'\n'}
                {exam.name} • {exam.num_questions} questions
              </Text>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleCapture}
                disabled={processing}
              >
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
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
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  guidesButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  templateFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    borderStyle: 'dashed',
  },
  cornerGuide: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  guideOverlay: {
    position: 'absolute',
    bottom: 200,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 4,
  },
  guideLabel: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    paddingBottom: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  instructions: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
    resizeMode: 'contain',
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
  permissionText: {
    fontSize: 18,
    color: '#6b7280',
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
