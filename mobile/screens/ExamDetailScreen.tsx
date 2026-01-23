import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native'

export default function ExamDetailScreen({ route, navigation }: any) {
  const { exam } = route.params

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{exam.name}</Text>
        <Text style={styles.subtitle}>
          {exam.classes.name} - {exam.classes.grade_level} {exam.classes.section}
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date:</Text>
            <Text style={styles.infoValue}>{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'Not set'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Questions:</Text>
            <Text style={styles.infoValue}>{exam.num_questions || 0}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Student ID Length:</Text>
            <Text style={styles.infoValue}>{exam.classes?.schools?.student_id_length || 10}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => navigation.navigate('Scanner', { exam })}
        >
          <Text style={styles.scanButtonText}>Start Scanning</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.calibrateButton}
          onPress={() => navigation.navigate('Calibration')}
        >
          <Text style={styles.calibrateButtonText}>⚙️ Calibrate Scanner</Text>
        </TouchableOpacity>

        <Text style={styles.helpText}>
          Position the bubble sheet in the camera frame and tap to scan.{'\n'}
          Use calibration if bubbles aren't being detected correctly.
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    color: '#6b7280',
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  scanButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
})
