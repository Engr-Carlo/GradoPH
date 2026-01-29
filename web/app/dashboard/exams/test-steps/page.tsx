'use client'

import { useState, useRef } from 'react'

type ScanStep = 'qr' | 'student_id' | 'answers'

export default function TestStepsPage() {
  const [selectedStep, setSelectedStep] = useState<ScanStep>('qr')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string)
        setResult(null)
        setError(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const testStep = async () => {
    if (!imagePreview) {
      setError('Please select an image first')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Extract base64 from data URL
      const base64 = imagePreview.split(',')[1]

      const response = await fetch('/api/scans/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          step: selectedStep,
          exam_id: 'test-exam',
          num_questions: 10,
        }),
      })

      const data = await response.json()
      setResult(data)

      if (!data.success) {
        setError(data.error || 'Step failed')
      }
    } catch (err: any) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const steps: { key: ScanStep; label: string; icon: string; desc: string }[] = [
    { key: 'qr', label: 'Step 1: QR Code', icon: '📱', desc: 'Scan the QR code to verify exam' },
    { key: 'student_id', label: 'Step 2: Student ID', icon: '🆔', desc: 'Read the student ID bubbles' },
    { key: 'answers', label: 'Step 3: Answers', icon: '📝', desc: 'Read the answer bubbles' },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🔬 Step-by-Step Scanner Test</h1>
        <p className="text-gray-400 mb-8">Test each scanning step individually</p>

        {/* Step Selector */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {steps.map((step) => (
            <button
              key={step.key}
              onClick={() => setSelectedStep(step.key)}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedStep === step.key
                  ? 'border-blue-500 bg-blue-500/20'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="text-3xl mb-2">{step.icon}</div>
              <div className="font-semibold">{step.label}</div>
              <div className="text-sm text-gray-400">{step.desc}</div>
            </button>
          ))}
        </div>

        {/* Image Upload */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">📷 Upload Test Image</h2>
          
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex gap-4 items-start">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
            >
              Choose Image
            </button>

            {imagePreview && (
              <div className="flex-1">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-64 rounded-lg border border-gray-700"
                />
              </div>
            )}
          </div>
        </div>

        {/* Test Button */}
        <button
          onClick={testStep}
          disabled={loading || !imagePreview}
          className={`w-full py-4 rounded-lg font-bold text-lg mb-8 ${
            loading || !imagePreview
              ? 'bg-gray-700 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {loading ? '⏳ Processing...' : `🚀 Test ${steps.find(s => s.key === selectedStep)?.label}`}
        </button>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-8">
            <h3 className="text-red-400 font-semibold mb-2">❌ Error</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className={`rounded-lg p-6 mb-8 ${
            result.success 
              ? 'bg-green-900/30 border border-green-500' 
              : 'bg-yellow-900/30 border border-yellow-500'
          }`}>
            <h3 className={`text-xl font-semibold mb-4 ${
              result.success ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {result.success ? '✅ Success!' : '⚠️ Detection Issue'}
            </h3>

            {/* QR Result */}
            {result.step === 'qr' && result.success && (
              <div className="space-y-2">
                <p><span className="text-gray-400">Exam ID:</span> {result.exam_id}</p>
                <p><span className="text-gray-400">Raw Data:</span> {result.raw_data}</p>
                <p className="text-green-400 mt-4">{result.message}</p>
              </div>
            )}

            {/* Student ID Result */}
            {result.step === 'student_id' && (
              <div className="space-y-2">
                <p><span className="text-gray-400">Student ID:</span> <span className="text-2xl font-mono">{result.student_id || result.partial_id}</span></p>
                <p><span className="text-gray-400">Confidence:</span> {result.confidence}%</p>
                {result.has_undetected && (
                  <p className="text-yellow-400">⚠️ Some digits could not be detected clearly</p>
                )}
                <p className="text-green-400 mt-4">{result.message}</p>
              </div>
            )}

            {/* Answers Result */}
            {result.step === 'answers' && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <p><span className="text-gray-400">Answered:</span> {result.answered_count}/{result.total_questions}</p>
                  <p><span className="text-gray-400">Confidence:</span> {result.confidence}%</p>
                </div>
                
                <div>
                  <p className="text-gray-400 mb-2">Detected Answers:</p>
                  <div className="grid grid-cols-10 gap-2 font-mono text-center">
                    {result.answers?.map((answer: string, idx: number) => (
                      <div key={idx} className={`p-2 rounded ${
                        answer ? 'bg-green-800' : 'bg-gray-700'
                      }`}>
                        <div className="text-xs text-gray-400">{idx + 1}</div>
                        <div className="font-bold">{answer || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Hint for failures */}
            {!result.success && result.hint && (
              <p className="text-yellow-400 mt-4">💡 {result.hint}</p>
            )}

            {/* Debug Info */}
            {result.debug && (
              <details className="mt-6">
                <summary className="cursor-pointer text-gray-400 hover:text-white">
                  🔧 Debug Info (click to expand)
                </summary>
                <pre className="mt-2 p-4 bg-gray-900 rounded-lg overflow-auto text-xs">
                  {JSON.stringify(result.debug, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Full Response */}
        {result && (
          <details className="bg-gray-800 rounded-lg p-4">
            <summary className="cursor-pointer text-gray-400 hover:text-white font-semibold">
              📋 Full API Response
            </summary>
            <pre className="mt-4 p-4 bg-gray-900 rounded-lg overflow-auto text-sm">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
