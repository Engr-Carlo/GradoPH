import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'

interface ClassInfo {
  name: string
  grade_level: string
  section: string
  school_id: string
  schools: {
    student_id_length: number
  } | null
}

interface Exam {
  id: string
  name: string
  exam_date: string | null
  answer_key_json: string[] | null
  num_questions: number
  classes: ClassInfo | null
}

export default function ExamsListScreen({ navigation }: any) {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchExams()
  }, [])

  async function fetchExams() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigation.replace('Login')
        return
      }

      const { data, error } = await supabase
        .from('exams')
        .select(`
          id,
          name,
          exam_date,
          answer_key_json,
          classes (
            name,
            grade_level,
            section,
            school_id,
            schools (
              student_id_length
            )
          )
        `)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Derive num_questions from answer_key_json and normalize classes structure
      const examsWithCount = (data || []).map((exam: any) => ({
        id: exam.id,
        name: exam.name,
        exam_date: exam.exam_date,
        answer_key_json: exam.answer_key_json,
        num_questions: exam.answer_key_json?.length || 0,
        // Handle both single object and array from Supabase
        classes: Array.isArray(exam.classes) ? exam.classes[0] : exam.classes
      })) as Exam[]
      setExams(examsWithCount)
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigation.replace('Login')
  }

  function renderExamCard({ item }: { item: Exam }) {
    const classInfo = item.classes
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ExamDetail', { exam: item })}
      >
        <Text style={styles.examName}>{item.name}</Text>
        <Text style={styles.className}>
          {classInfo?.name} - {classInfo?.grade_level} {classInfo?.section}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{item.num_questions || 0} questions</Text>
          <Text style={styles.metaText}>{item.exam_date ? new Date(item.exam_date).toLocaleDateString() : 'No date'}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Exams</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.testButton}
            onPress={() => navigation.navigate('TestScanner')}
          >
            <Text style={styles.testButtonText}>🔬 Test</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {exams.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No exams yet</Text>
          <Text style={styles.emptySubtext}>Create exams from the web dashboard</Text>
        </View>
      ) : (
        <FlatList
          data={exams}
          keyExtractor={(item) => item.id}
          renderItem={renderExamCard}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                fetchExams()
              }}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  testButtonText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '600',
  },
  logoutText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  examName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  className: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  emptyText: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
  },
})

