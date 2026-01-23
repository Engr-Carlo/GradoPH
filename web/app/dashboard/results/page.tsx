'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Scan {
  id: string
  student_id: string
  answers_json: string[]
  confidence: number
  is_unknown_student: boolean
  score: number
  scanned_at: string
  image_path: string
  students: {
    name: string
  } | null
}

interface Exam {
  id: string
  name: string
  exam_date: string
  answer_key_json: string[]
  classes: {
    id: string
    name: string
    grade_level: string
    section: string
  }
}

function ResultsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const examId = searchParams.get('exam_id')

  const [exam, setExam] = useState<Exam | null>(null)
  const [scans, setScans] = useState<Scan[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')

  useEffect(() => {
    checkAuthAndLoad()
  }, [examId])

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
      // Load all exams for dropdown
      const { data: examsData } = await supabase
        .from('exams')
        .select(`
          *,
          classes!inner (
            name,
            grade_level,
            section,
            school_id
          )
        `)
        .eq('classes.school_id', teacherData.school_id)
        .order('created_at', { ascending: false })

      setExams(examsData || [])

      if (examId) {
        await loadExamResults(examId)
      }
    }
    setLoading(false)
  }

  const loadExamResults = async (eId: string) => {
    const { data: examData } = await supabase
      .from('exams')
      .select(`
        *,
        classes (
          name,
          grade_level,
          section,
          id
        )
      `)
      .eq('id', eId)
      .single()

    if (examData) {
      setExam(examData as Exam)

      // Load scans with student info
      const { data: scansData } = await supabase
        .from('scans')
        .select(`
          *,
          students (
            name
          )
        `)
        .eq('exam_id', eId)
        .order('scanned_at', { ascending: false })

      setScans(scansData || [])
    }
  }

  const handleAddStudent = async () => {
    if (!selectedScan || !exam) return

    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .insert([{
        student_id: selectedScan.student_id,
        name: newStudentName,
        class_id: exam.classes.id,
      }])
      .select()
      .single()

    if (!studentError) {
      const { error: updateError } = await supabase
        .from('scans')
        .update({ is_unknown_student: false })
        .eq('id', selectedScan.id)

      if (!updateError) {
        setShowAddStudent(false)
        setNewStudentName('')
        setSelectedScan(null)
        await loadExamResults(exam.id)
      }
    } else {
      alert('Failed to add student: ' + studentError.message)
    }
  }

  const exportToCSV = () => {
    if (!exam || scans.length === 0) return

    const headers = ['Student ID', 'Name', 'Score', ...Array.from({ length: 50 }, (_, i) => `Q${i + 1}`)]
    const rows = scans.map(scan => [
      scan.student_id,
      scan.students?.name || 'Unknown',
      scan.score.toString(),
      ...scan.answers_json.map(a => a || '-')
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exam.name}_results.csv`
    a.click()
  }

  const getAverage = () => {
    if (scans.length === 0) return 0
    return (scans.reduce((sum, scan) => sum + scan.score, 0) / scans.length).toFixed(2)
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
              <h1 className="text-2xl font-bold text-gray-900">Exam Results</h1>
              {exam && (
                <p className="text-sm text-gray-600">
                  {exam.name} - {exam.classes.name}
                </p>
              )}
            </div>
            {exam && scans.length > 0 && (
              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Export CSV
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!examId && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select an Exam
            </label>
            <select
              className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                if (e.target.value) {
                  router.push(`/dashboard/results?exam_id=${e.target.value}`)
                }
              }}
            >
              <option value="">Choose an exam...</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} - {ex.classes.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {exam && (
          <>
            {/* Statistics */}
            {scans.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600">Total Scans</div>
                  <div className="text-2xl font-bold text-gray-900">{scans.length}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600">Class Average</div>
                  <div className="text-2xl font-bold text-blue-600">{getAverage()}/50</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600">Highest Score</div>
                  <div className="text-2xl font-bold text-green-600">
                    {Math.max(...scans.map(s => s.score))}/50
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-600">Unknown Students</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {scans.filter(s => s.is_unknown_student).length}
                  </div>
                </div>
              </div>
            )}

            {/* Scans Table */}
            {scans.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No scans yet</h3>
                <p className="text-gray-600">Use the mobile app to scan answer sheets</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Student ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Score
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {scans.map((scan) => (
                      <tr key={scan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {scan.student_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {scan.students?.name || (
                            <span className="text-orange-600 font-medium">Unknown Student</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                          <span className={`font-semibold ${scan.score >= 40 ? 'text-green-600' : scan.score >= 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {scan.score}/50
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                          {scan.confidence.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {scan.is_unknown_student ? (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                              Unknown
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                              Verified
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setSelectedScan(scan)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            View Details
                          </button>
                          {scan.is_unknown_student && (
                            <button
                              onClick={() => {
                                setSelectedScan(scan)
                                setShowAddStudent(true)
                              }}
                              className="text-green-600 hover:text-green-900"
                            >
                              Add Student
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* View Details Modal */}
        {selectedScan && !showAddStudent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold">Scan Details</h3>
                  <p className="text-sm text-gray-600">
                    {selectedScan.students?.name || selectedScan.student_id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedScan(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-10 gap-2">
                {selectedScan.answers_json.map((answer, index) => {
                  const correct = answer === exam?.answer_key_json[index]
                  return (
                    <div
                      key={index}
                      className={`p-2 rounded text-center ${
                        correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      <div className="text-xs">Q{index + 1}</div>
                      <div className="font-bold">{answer}</div>
                      {!correct && (
                        <div className="text-xs">({exam?.answer_key_json[index]})</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Add Student Modal */}
        {showAddStudent && selectedScan && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-xl font-semibold mb-4">Add New Student</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student ID
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedScan.student_id}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter student name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddStudent}
                    disabled={!newStudentName.trim()}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add Student
                  </button>
                  <button
                    onClick={() => {
                      setShowAddStudent(false)
                      setSelectedScan(null)
                      setNewStudentName('')
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading results...</div>}>
      <ResultsContent />
    </Suspense>
  )
}
