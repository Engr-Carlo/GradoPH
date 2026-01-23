import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { CameraView, Camera } from 'expo-camera'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function CalibrationScreen({ navigation }: any) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [threshold, setThreshold] = useState(50)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [detectionResults, setDetectionResults] = useState<any>(null)
  const cameraRef = useRef<any>(null)

  React.useEffect(() => {
    loadSavedThreshold()
    requestPermissions()
  }, [])

  async function loadSavedThreshold() {
    try {
      const saved = await AsyncStorage.getItem('bubble_threshold_override')
      if (saved) {
        setThreshold(parseInt(saved, 10))
      }
    } catch (error) {
      console.error('Failed to load threshold:', error)
    }
  }

  async function requestPermissions() {
    const { status } = await Camera.requestCameraPermissionsAsync()
    setHasPermission(status === 'granted')
  }

  async function handleCapture() {
    if (processing || !cameraRef.current) return
    
    setProcessing(true)

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      })

      setCapturedImage(photo.uri)
      // Simulate bubble detection with mock data for now
      // In real implementation, this would call a calibration API endpoint
      simulateDetection(photo.base64)
      setProcessing(false)
      
    } catch (error: any) {
      Alert.alert('Error', error.message)
      setProcessing(false)
    }
  }

  function simulateDetection(base64: string) {
    // Mock detection results showing fill percentages for calibration
    const mockResults = Array.from({ length: 10 }, (_, i) => ({
      question: i + 1,
      choices: [
        { letter: 'A', fill: i === 0 ? 65 : 10 + Math.random() * 15 },
        { letter: 'B', fill: i === 1 ? 70 : 10 + Math.random() * 15 },
        { letter: 'C', fill: i === 2 ? 60 : 10 + Math.random() * 15 },
        { letter: 'D', fill: i === 3 ? 55 : 10 + Math.random() * 15 },
      ]
    }))
    setDetectionResults(mockResults)
  }

  async function saveThreshold() {
    try {
      await AsyncStorage.setItem('bubble_threshold_override', threshold.toString())
      Alert.alert(
        'Calibration Saved',
        `Bubble threshold set to ${threshold}%\n\nThis will be used for all future scans on this device.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (error) {
      Alert.alert('Error', 'Failed to save calibration')
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

  return (
    <View style={styles.container}>
      {capturedImage ? (
        <View style={styles.resultsContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewSmall} />
          
          <View style={styles.controls}>
            <Text style={styles.title}>Bubble Detection Calibration</Text>
            <Text style={styles.subtitle}>
              Adjust the threshold until filled bubbles are correctly detected
            </Text>

            <View style={styles.sliderContainer}>
              <Text style={styles.label}>Sensitivity Threshold: {threshold}%</Text>
              <Slider
                style={styles.slider}
                minimumValue={20}
                maximumValue={70}
                step={5}
                value={threshold}
                onValueChange={setThreshold}
                minimumTrackTintColor="#2563eb"
                maximumTrackTintColor="#d1d5db"
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>Less Sensitive</Text>
                <Text style={styles.sliderLabel}>More Sensitive</Text>
              </View>
            </View>

            {detectionResults && (
              <View style={styles.resultsGrid}>
                <Text style={styles.resultsTitle}>Detection Preview (First 5 Questions):</Text>
                {detectionResults.slice(0, 5).map((result: any) => (
                  <View key={result.question} style={styles.resultRow}>
                    <Text style={styles.questionNum}>Q{result.question}:</Text>
                    {result.choices.map((choice: any) => (
                      <View
                        key={choice.letter}
                        style={[
                          styles.choiceBubble,
                          choice.fill > threshold && styles.choiceDetected
                        ]}
                      >
                        <Text style={[
                          styles.choiceText,
                          choice.fill > threshold && styles.choiceTextDetected
                        ]}>
                          {choice.letter}
                        </Text>
                        <Text style={styles.fillText}>{Math.round(choice.fill)}%</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={() => {
                  setCapturedImage(null)
                  setDetectionResults(null)
                }}
              >
                <Text style={styles.buttonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveThreshold}
              >
                <Text style={styles.buttonText}>Save Calibration</Text>
              </TouchableOpacity>
            </View>
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
                <Text style={styles.buttonText}>← Back</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.instructions}>
                Capture a test answer sheet with known answers{'\n'}
                (e.g., all A's or a specific pattern)
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
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
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
  resultsContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  previewSmall: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
    backgroundColor: '#000',
  },
  controls: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  sliderContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  resultsGrid: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  questionNum: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    width: 40,
  },
  choiceBubble: {
    flex: 1,
    marginHorizontal: 4,
    padding: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  choiceDetected: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  choiceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  choiceTextDetected: {
    color: '#10b981',
  },
  fillText: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  retakeButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
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
