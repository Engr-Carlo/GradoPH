'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { generateBubbleSheetPDF } from '@/lib/generateTemplate'

type Answer = 'A' | 'B' | 'C' | 'D'

interface Exam {
  id: string
  name: string
  exam_date: string
  answer_key_json: Answer[]
  answer_key_locked: boolean
  created_at: string
  classes: {
    id: string
    name: string
    grade_level: string
    section: string
    school_id: string
  }
}

interface Class {
  id: string
  name: string
  grade_level: string
  section: string
}

function ExamsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const classId = searchParams.get('class_id')

  const [exams, setExams] = useState<Exam[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('')
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string>('')
  const [previewZoom, setPreviewZoom] = useState(100)
  const [formData, setFormData] = useState({
    name: '',
    exam_date: new Date().toISOString().split('T')[0],
    class_id: classId || '',
  })
  const [numQuestions, setNumQuestions] = useState(50)
  const [answerKey, setAnswerKey] = useState<Answer[]>(Array(50).fill('A'))
  const [showGrid, setShowGrid] = useState<boolean>(false)
  const [currentExam, setCurrentExam] = useState<Exam | null>(null)

  const loadExams = async (schoolId: string) => {
    const { data } = await supabase
      .from('exams')
      .select(`
        *,
        classes!inner (
          id,
          name,
          grade_level,
          section,
          school_id
        )
      `)
      .eq('classes.school_id', schoolId)
      .order('created_at', { ascending: false })

    setExams(data || [])
  }

  const checkAuthAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: teacherData } = await supabase
      .from('teachers')
      .select('school_id')
      .eq('id', user.id)
      .single()

    if (teacherData) {
      const { data: classesData } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', teacherData.school_id)
        .order('name')

      setClasses(classesData || [])

      if (classId) {
        const cls = classesData?.find(c => c.id === classId)
        if (cls) {
          setSelectedClass(cls)
          setFormData(prev => ({ ...prev, class_id: classId }))
        }
      }

      await loadExams(teacherData.school_id)
    }
    setLoading(false)
  }

  useEffect(() => {
    checkAuthAndLoad()
  }, [classId])

  const handleDownloadTemplate = async (exam: Exam) => {
    const { data: schoolData } = await supabase
      .from('schools')
      .select('student_id_length')
      .eq('id', exam.classes.school_id)
      .single()

    if (schoolData) {
      const result = await generateBubbleSheetPDF({
        exam_id: exam.id,
        exam_name: exam.name,
        class_name: `${exam.classes.name} - ${exam.classes.grade_level} ${exam.classes.section}`,
        exam_date: new Date(exam.exam_date).toLocaleDateString(),
        student_id_length: schoolData.student_id_length,
        num_questions: exam.answer_key_json.length, // use answer key length
        show_grid: showGrid,
        layout: {
          qr: { x: -375, y: -450 }
        }
      })
      
      setPreviewImageUrl(result.png)
      setPreviewPdfUrl(result.pdf)
      setShowPreview(true)
      setPreviewZoom(100)
      setCurrentExam(exam)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (!formData.class_id) {
      alert('Please select a class')
      return
    }

    // Generate 32-bit hash for custom barcode
    const generateExamHash = (str: string): number => {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & 0x7FFFFFFF // Keep positive 32-bit
      }
      return hash
    }

    const tempId = `${Date.now()}-${Math.random()}`
    const examHash = generateExamHash(tempId)

    const { error, data: insertedExam } = await supabase
      .from('exams')
      .insert([{
        name: formData.name,
        exam_date: formData.exam_date,
        class_id: formData.class_id,
        template_id: `TEMPLATE-${Date.now()}`,
        answer_key_json: answerKey,
        num_questions: numQuestions,
        exam_code_hash: examHash,
        created_by: user.id,
      }])
      .select()
      .single()

    if (!error) {
      setFormData({
        name: '',
        exam_date: new Date().toISOString().split('T')[0],
        class_id: classId || '',
      })
      setAnswerKey(Array(50).fill('A'))
      setShowForm(false)
      
      const { data: teacherData } = await supabase
        .from('teachers')
        .select('school_id')
        .eq('id', user.id)
        .single()

      if (teacherData) {
        await loadExams(teacherData.school_id)
      }
    } else {
      alert('Failed to create exam: ' + error.message)
    }
  }

  const updateAnswer = (index: number, value: Answer) => {
    const newKey = [...answerKey]
    newKey[index] = value
    setAnswerKey(newKey)
  }

  const handleNumQuestionsChange = (num: number) => {
    const validNum = Math.max(1, Math.min(100, num)) // between 1 and 100
    setNumQuestions(validNum)
    const newKey = Array(validNum).fill('A')
    // Preserve existing answers if shrinking
    for (let i = 0; i < Math.min(validNum, answerKey.length); i++) {
      newKey[i] = answerKey[i]
    }
    setAnswerKey(newKey)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block">
                ← Back to Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Manage Exams</h1>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/exams/test"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
              >
                🔬 Scanner Test
              </Link>
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {showForm ? 'Cancel' : '+ Create Exam'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Exam</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Exam Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Midterm Exam"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Exam Date
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.exam_date}
                    onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Questions
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    placeholder="e.g., 50"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={numQuestions}
                    onChange={(e) => handleNumQuestionsChange(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Class
                  </label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.class_id}
                    onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                  >
                    <option value="">Select class...</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} - {cls.grade_level} {cls.section}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Answer Key ({numQuestions} Questions)
                </label>
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                  {answerKey.map((answer, index) => (
                    <div key={index} className="flex flex-col">
                      <label className="text-xs text-gray-600 mb-1">Q{index + 1}</label>
                      <select
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={answer}
                        onChange={(e) => updateAnswer(index, e.target.value as Answer)}
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create Exam
                </button>
                <button
                  type="button"
                  onClick={() => setAnswerKey(Array(numQuestions).fill('A'))}
                  className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Reset to All A
                </button>
              </div>
            </form>
          </div>
        )}

        {exams.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No exams yet</h3>
            <p className="text-gray-600">Create your first exam to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{exam.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Date: {new Date(exam.exam_date).toLocaleDateString()}
                    </p>
                    {exam.answer_key_locked && (
                      <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                        🔒 Answer Key Locked
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/dashboard/results?exam_id=${exam.id}`}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      View Results
                    </Link>
                    <button
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      onClick={() => handleDownloadTemplate(exam)}
                    >
                      Preview Template
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-white">
              <h2 className="text-xl font-bold">Template Preview</h2>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={async (e) => {
                      setShowGrid(e.target.checked)
                      // Regenerate the preview if an exam is currently selected
                      if (currentExam) {
                        await handleDownloadTemplate(currentExam)
                      }
                    }}
                  />
                  Show grid
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewZoom(Math.max(50, previewZoom - 10))}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    disabled={previewZoom <= 50}
                  >
                    −
                  </button>
                  <span className="text-sm font-medium w-16 text-center">{previewZoom}%</span>
                  <button
                    onClick={() => setPreviewZoom(Math.min(200, previewZoom + 10))}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    disabled={previewZoom >= 200}
                  >
                    +
                  </button>
                  <button
                    onClick={() => setPreviewZoom(100)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setPreviewZoom(100)}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    Fit
                  </button>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <div className="flex justify-center">
                <img 
                  src={previewImageUrl} 
                  alt="Answer Sheet Template" 
                  className="border border-gray-300 shadow-lg"
                  style={{ width: `${previewZoom}%` }}
                />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2 bg-white">
              <button
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = previewImageUrl
                  link.download = 'answer-sheet-template.png'
                  link.click()
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Download PNG
              </button>
              <button
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = previewPdfUrl
                  link.download = 'answer-sheet-template.pdf'
                  link.click()
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Download PDF
              </button>
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExamsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading exams...</div>}>
      <ExamsContent />
    </Suspense>
  )
}
