'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Student {
  id: string
  student_id: string
  name: string
  created_at: string
}

interface Class {
  id: string
  name: string
  grade_level: string
  section: string
}

function StudentsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const classId = searchParams.get('class_id')

  const [students, setStudents] = useState<Student[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [studentIdLength, setStudentIdLength] = useState(8)
  const [formData, setFormData] = useState({
    student_id: '',
    name: '',
  })

  useEffect(() => {
    checkAuthAndLoad()
  }, [classId])

  const checkAuthAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Get school info for student ID length
    const { data: teacherData } = await supabase
      .from('teachers')
      .select('school_id')
      .eq('id', user.id)
      .single()

    if (teacherData) {
      const { data: schoolData } = await supabase
        .from('schools')
        .select('student_id_length')
        .eq('id', teacherData.school_id)
        .single()

      if (schoolData) {
        setStudentIdLength(schoolData.student_id_length)
      }

      // Load classes
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
          await loadStudents(classId)
        }
      }
    }
    setLoading(false)
  }

  const loadStudents = async (clsId: string) => {
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', clsId)
      .order('student_id')

    setStudents(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedClass) {
      alert('Please select a class first')
      return
    }

    if (formData.student_id.length !== studentIdLength) {
      alert(`Student ID must be exactly ${studentIdLength} digits`)
      return
    }

    const { error } = await supabase
      .from('students')
      .insert([{
        ...formData,
        class_id: selectedClass.id,
      }])

    if (!error) {
      setFormData({ student_id: '', name: '' })
      setShowForm(false)
      await loadStudents(selectedClass.id)
    } else {
      if (error.message.includes('duplicate')) {
        alert('This student ID already exists in this class')
      } else {
        alert('Failed to add student: ' + error.message)
      }
    }
  }

  const handleDelete = async (studentId: string) => {
    if (!confirm('Are you sure you want to delete this student?')) {
      return
    }

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId)

    if (!error && selectedClass) {
      await loadStudents(selectedClass.id)
    } else if (error) {
      alert('Failed to delete student: ' + error.message)
    }
  }

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClass) return

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    const students: { student_id: string; name: string; class_id: string }[] = []

    // Skip header if exists
    const startIndex = lines[0].toLowerCase().includes('student') ? 1 : 0

    for (let i = startIndex; i < lines.length; i++) {
      const [student_id, name] = lines[i].split(',').map(s => s.trim())
      if (student_id && name) {
        if (student_id.length !== studentIdLength) {
          alert(`Invalid student ID length on line ${i + 1}: ${student_id}`)
          return
        }
        students.push({ student_id, name, class_id: selectedClass.id })
      }
    }

    if (students.length === 0) {
      alert('No valid students found in CSV')
      return
    }

    const { error } = await supabase
      .from('students')
      .insert(students)

    if (!error) {
      alert(`Successfully imported ${students.length} students`)
      await loadStudents(selectedClass.id)
    } else {
      alert('Failed to import students: ' + error.message)
    }

    e.target.value = '' // Reset file input
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
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block">
                ← Back to Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Manage Students</h1>
              {selectedClass && (
                <p className="text-sm text-gray-600">
                  {selectedClass.name} - {selectedClass.grade_level} Section {selectedClass.section}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {selectedClass && (
                <>
                  <label className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 cursor-pointer">
                    Import CSV
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCSVImport}
                    />
                  </label>
                  <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {showForm ? 'Cancel' : '+ Add Student'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Class Selector */}
        {!classId && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select a Class
            </label>
            <select
              className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                const cls = classes.find(c => c.id === e.target.value)
                setSelectedClass(cls || null)
                if (cls) loadStudents(cls.id)
              }}
            >
              <option value="">Choose a class...</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} - {cls.grade_level} Section {cls.section}
                </option>
              ))}
            </select>
          </div>
        )}

        {!selectedClass && classId === null && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">Please select a class to manage students</p>
          </div>
        )}

        {selectedClass && (
          <>
            {/* Add Form */}
            {showForm && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Add New Student</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Student ID ({studentIdLength} digits)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={studentIdLength}
                        pattern="\d+"
                        placeholder={`${'0'.repeat(studentIdLength)}`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.student_id}
                        onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Juan Dela Cruz"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Add Student
                  </button>
                </form>
              </div>
            )}

            {/* CSV Format Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">CSV Import Format</h3>
              <p className="text-sm text-blue-800 mb-2">Your CSV file should have 2 columns:</p>
              <code className="block bg-white p-2 rounded text-sm">
                student_id,name<br/>
                {`${'12345678'.slice(0, studentIdLength)},Juan Dela Cruz`}<br/>
                {`${'87654321'.slice(0, studentIdLength)},Maria Santos`}
              </code>
            </div>

            {/* Students List */}
            {students.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No students yet</h3>
                <p className="text-gray-600 mb-4">Add students individually or import from CSV</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {students.map((student) => (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {student.student_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {student.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDelete(student.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-gray-50 px-6 py-3 text-sm text-gray-700">
                  Total: {students.length} student{students.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading students...</div>}>
      <StudentsContent />
    </Suspense>
  )
}
