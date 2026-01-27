import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

interface TestResult {
  studentId: {
    value: string
    confidence: number
    digits: Array<{ digit: string; fillRatio: number }>
  }
  answers: Array<{
    question: number
    answer: string
    confidence: number
    fillRatios: { A: number; B: number; C: number; D: number; E: number }
  }>
  metadata?: {
    processingTime: number
    imageSize: { width: number; height: number }
  }
}

export default function TestScannerScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false)
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [results, setResults] = useState<TestResult | null>(null)
  const [expectedStudentId, setExpectedStudentId] = useState('1234567890')
  const [expectedAnswers, setExpectedAnswers] = useState<string[]>(
    Array(10).fill('A') // First 10 questions, all A
  )

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    })

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
      setResults(null)
    }
  }

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera permissions')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 1,
    })

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
      setResults(null)
    }
  }

  const testScan = async () => {
    if (!imageUri) {
      Alert.alert('No image', 'Please select or take a photo first')
      return
    }

    setLoading(true)
    try {
      // Get auth token
      const token = await AsyncStorage.getItem('supabase_token')
      if (!token) {
        Alert.alert('Error', 'Not authenticated')
        setLoading(false)
        return
      }

      // Upload image to storage
      const fileName = `test-${Date.now()}.jpg`
      
      // Upload using fetch and FormData (React Native compatible)
      const formData = new FormData()
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: fileName,
      } as any)

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('scan-images')
        .upload(fileName, formData as any, {
          contentType: 'image/jpeg',
        })

      if (uploadError) throw uploadError

      // Call test API
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://your-app.vercel.app'
      const response = await fetch(`${apiUrl}/api/scans/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imagePath: fileName,
          debug: true,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process scan')
      }

      setResults(data.results)
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const calculateAccuracy = () => {
    if (!results) return { studentId: 0, answers: 0 }

    const studentIdCorrect =
      results.studentId.value === expectedStudentId ? 100 : 0

    const correctAnswers = results.answers.filter(
      (ans, idx) => ans.answer === expectedAnswers[idx]
    ).length

    const answersAccuracy =
      (correctAnswers / expectedAnswers.length) * 100

    return {
      studentId: studentIdCorrect,
      answers: Math.round(answersAccuracy),
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>OMR Test Scanner</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Select or Take Photo</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonText}>📁 Pick from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={takePhoto}>
            <Text style={styles.buttonText}>📷 Take Photo</Text>
          </TouchableOpacity>
        </View>

        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Test Scan</Text>
        <TouchableOpacity
          style={[styles.testButton, !imageUri && styles.buttonDisabled]}
          onPress={testScan}
          disabled={!imageUri || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.testButtonText}>🔬 Test Scan</Text>
          )}
        </TouchableOpacity>
      </View>

      {results && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Results</Text>

          <View style={styles.accuracyCards}>
            <View style={styles.accuracyCard}>
              <Text style={styles.accuracyLabel}>Student ID Accuracy</Text>
              <Text style={styles.accuracyValue}>
                {calculateAccuracy().studentId}%
              </Text>
            </View>
            <View style={styles.accuracyCard}>
              <Text style={styles.accuracyLabel}>Answer Accuracy</Text>
              <Text style={styles.accuracyValue}>
                {calculateAccuracy().answers}%
              </Text>
            </View>
          </View>

          <View style={styles.comparison}>
            <Text style={styles.comparisonTitle}>Student ID Comparison</Text>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Expected:</Text>
              <Text style={styles.comparisonValue}>{expectedStudentId}</Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Detected:</Text>
              <Text
                style={[
                  styles.comparisonValue,
                  results.studentId.value === expectedStudentId
                    ? styles.correct
                    : styles.incorrect,
                ]}
              >
                {results.studentId.value} ({results.studentId.confidence}% conf)
              </Text>
            </View>
          </View>

          <View style={styles.comparison}>
            <Text style={styles.comparisonTitle}>Answer Comparison</Text>
            {results.answers.slice(0, 10).map((ans, idx) => (
              <View key={idx} style={styles.answerRow}>
                <Text style={styles.answerNum}>Q{ans.question}</Text>
                <Text style={styles.answerExpected}>
                  {expectedAnswers[idx] || '-'}
                </Text>
                <Text
                  style={[
                    styles.answerDetected,
                    ans.answer === expectedAnswers[idx]
                      ? styles.correct
                      : styles.incorrect,
                  ]}
                >
                  {ans.answer}
                </Text>
                <Text style={styles.answerFill}>
                  {ans.fillRatios[ans.answer as keyof typeof ans.fillRatios]}%
                </Text>
                <Text style={styles.answerStatus}>
                  {ans.answer === expectedAnswers[idx] ? '✓' : '✗'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    fontSize: 16,
    color: '#2563eb',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    color: '#1f2937',
  },
  preview: {
    width: '100%',
    height: 300,
    marginTop: 12,
    borderRadius: 6,
    resizeMode: 'contain',
  },
  testButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  accuracyCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  accuracyCard: {
    flex: 1,
    backgroundColor: '#dbeafe',
    padding: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  accuracyLabel: {
    fontSize: 12,
    color: '#1e40af',
    marginBottom: 4,
  },
  accuracyValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  comparison: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  comparisonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1f2937',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  comparisonLabel: {
    width: 80,
    fontSize: 14,
    color: '#6b7280',
  },
  comparisonValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  correct: {
    color: '#059669',
  },
  incorrect: {
    color: '#dc2626',
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  answerNum: {
    width: 40,
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  answerExpected: {
    width: 40,
    fontSize: 14,
    color: '#6b7280',
  },
  answerDetected: {
    width: 40,
    fontSize: 14,
    fontWeight: '600',
  },
  answerFill: {
    flex: 1,
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
  },
  answerStatus: {
    width: 30,
    fontSize: 16,
    textAlign: 'center',
  },
})
