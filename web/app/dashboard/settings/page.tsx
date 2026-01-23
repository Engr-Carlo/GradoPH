'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface School {
  id: string
  name: string
  student_id_length: number
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [school, setSchool] = useState<School | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    student_id_length: 8,
  })

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

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
      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('id', teacherData.school_id)
        .single()

      if (schoolData) {
        setSchool(schoolData)
        setFormData({
          name: schoolData.name,
          student_id_length: schoolData.student_id_length,
        })
      }
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    if (!school) return

    const { error } = await supabase
      .from('schools')
      .update({
        name: formData.name,
        student_id_length: formData.student_id_length,
      })
      .eq('id', school.id)

    if (!error) {
      alert('Settings saved successfully!')
      await checkAuthAndLoad()
    } else {
      alert('Failed to save settings: ' + error.message)
    }

    setSaving(false)
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
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">School Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                School Name
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Student ID Length
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.student_id_length}
                onChange={(e) => setFormData({ ...formData, student_id_length: parseInt(e.target.value) })}
              >
                {[6, 7, 8, 9, 10, 11, 12].map(length => (
                  <option key={length} value={length}>
                    {length} digits
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-gray-600">
                This determines how many digits student IDs must have
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> Changing the student ID length will affect all future student imports. 
                Existing students will not be affected.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
