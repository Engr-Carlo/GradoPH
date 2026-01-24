'use client'

import { useState, useRef, useEffect } from 'react'
import { generateTestTemplatePDF, generateTestTemplateCanvas, OMR_TEMPLATE, TestTemplateConfig } from '@/lib/generateTestTemplate'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface ScanResult {
  success: boolean
  confidence: number
  student_id: {
    student_id: string
    confidence: number
  }
  answers: {
    question_number: number
    detected_answers: string[]
    confidence: number
    filled_percentage: number
  }[]
  debug?: {
    bubbleData: any[]
  }
  error?: string
}

export default function ScannerTestPage() {
  const supabase = createClientComponentClient()
  
  // Test configuration
  const [testStudentId, setTestStudentId] = useState('1234567890')
  const [testAnswers, setTestAnswers] = useState<string[]>(['A', 'B', 'C', 'D', 'E', 'A', 'B', 'C', 'D', 'E'])
  const [numQuestions, setNumQuestions] = useState(10)
  const [fillBubbles, setFillBubbles] = useState(true)
  const [showDebugGrid, setShowDebugGrid] = useState(false)
  
  // Preview and results
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Generate preview whenever config changes
  useEffect(() => {
    generatePreview()
  }, [testStudentId, testAnswers, numQuestions, fillBubbles, showDebugGrid])
  
  function generatePreview() {
    try {
      const config: TestTemplateConfig = {
        studentId: testStudentId,
        answers: testAnswers,
        numQuestions,
        fillBubbles,
        showDebugGrid,
      }
      const dataUrl = generateTestTemplateCanvas(config)
      setPreviewImage(dataUrl)
    } catch (err) {
      console.error('Preview generation error:', err)
    }
  }
  
  async function downloadPDF() {
    const config: TestTemplateConfig = {
      studentId: testStudentId,
      answers: testAnswers,
      numQuestions,
      fillBubbles,
      showDebugGrid,
    }
    await generateTestTemplatePDF(config)
  }
  
  function randomizeAnswers() {
    const options = ['A', 'B', 'C', 'D', 'E']
    const newAnswers = Array.from({ length: numQuestions }, () => 
      options[Math.floor(Math.random() * options.length)]
    )
    setTestAnswers(newAnswers)
  }
  
  async function testScanImage() {
    if (!previewImage) return
    
    setIsScanning(true)
    setError(null)
    setScanResult(null)
    
    try {
      // Convert data URL to blob
      const response = await fetch(previewImage)
      const blob = await response.blob()
      
      // Get session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }
      
      // Upload to storage
      const fileName = `test-scan-${Date.now()}.png`
      const filePath = `test/${fileName}`
      
      const { error: uploadError } = await supabase.storage
        .from('scan-images')
        .upload(filePath, blob, {
          contentType: 'image/png',
          upsert: true,
        })
      
      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }
      
      // Call the scan API with debug mode
      const apiResponse = await fetch('/api/scans/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image_path: filePath,
          num_questions: numQuestions,
          student_id_length: 10,
          bubble_threshold: 0.35,
          debug: true,
        }),
      })
      
      const result = await apiResponse.json()
      
      if (!apiResponse.ok) {
        throw new Error(result.error || 'Scan failed')
      }
      
      setScanResult(result)
      
    } catch (err: any) {
      setError(err.message)
      console.error('Scan test error:', err)
    } finally {
      setIsScanning(false)
    }
  }
  
  function getAccuracyStats() {
    if (!scanResult) return null
    
    const expectedId = testStudentId.padStart(10, '0')
    const detectedId = scanResult.student_id.student_id
    
    let idMatchCount = 0
    for (let i = 0; i < 10; i++) {
      if (expectedId[i] === detectedId[i]) idMatchCount++
    }
    
    let answerMatchCount = 0
    for (let i = 0; i < numQuestions; i++) {
      const expected = testAnswers[i]
      const detected = scanResult.answers[i]?.detected_answers[0]
      if (expected === detected) answerMatchCount++
    }
    
    return {
      idAccuracy: Math.round((idMatchCount / 10) * 100),
      answerAccuracy: Math.round((answerMatchCount / numQuestions) * 100),
      idDetails: { matched: idMatchCount, total: 10 },
      answerDetails: { matched: answerMatchCount, total: numQuestions },
    }
  }
  
  const stats = getAccuracyStats()
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">🔬 OMR Scanner Diagnostic Test</h1>
      <p className="text-gray-600 mb-6">
        Test the scanner with a known template to verify accuracy
      </p>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Configuration */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Test Configuration</h2>
            
            {/* Student ID */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test Student ID (10 digits)
              </label>
              <input
                type="text"
                value={testStudentId}
                onChange={(e) => setTestStudentId(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="1234567890"
                maxLength={10}
              />
            </div>
            
            {/* Number of questions */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Questions
              </label>
              <select
                value={numQuestions}
                onChange={(e) => {
                  const n = parseInt(e.target.value)
                  setNumQuestions(n)
                  setTestAnswers(prev => {
                    if (prev.length < n) {
                      return [...prev, ...Array(n - prev.length).fill('A')]
                    }
                    return prev.slice(0, n)
                  })
                }}
                className="w-full border rounded-lg px-3 py-2"
              >
                {[5, 10, 15, 20, 25, 50].map(n => (
                  <option key={n} value={n}>{n} questions</option>
                ))}
              </select>
            </div>
            
            {/* Test answers */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Test Answers
                </label>
                <button
                  onClick={randomizeAnswers}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Randomize
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {testAnswers.slice(0, numQuestions).map((ans, i) => (
                  <select
                    key={i}
                    value={ans}
                    onChange={(e) => {
                      const newAnswers = [...testAnswers]
                      newAnswers[i] = e.target.value
                      setTestAnswers(newAnswers)
                    }}
                    className="w-12 border rounded px-1 py-0.5 text-sm"
                  >
                    {['A', 'B', 'C', 'D', 'E'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
            
            {/* Options */}
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fillBubbles}
                  onChange={(e) => setFillBubbles(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Pre-fill bubbles (for automated testing)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showDebugGrid}
                  onChange={(e) => setShowDebugGrid(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show debug grid (pixel coordinates)</span>
              </label>
            </div>
            
            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={downloadPDF}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium"
              >
                📄 Download PDF
              </button>
              <button
                onClick={testScanImage}
                disabled={isScanning || !previewImage}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 px-4 rounded-lg font-medium"
              >
                {isScanning ? '⏳ Scanning...' : '🔍 Test Scan'}
              </button>
            </div>
          </div>
          
          {/* Template Info */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <h3 className="font-semibold mb-2">📐 Template Specifications</h3>
            <div className="grid grid-cols-2 gap-2 text-gray-600">
              <div>Canvas: {OMR_TEMPLATE.width}×{OMR_TEMPLATE.height}px</div>
              <div>Bubble: {OMR_TEMPLATE.bubbleWidth}×{OMR_TEMPLATE.bubbleHeight}px</div>
              <div>Student ID: ({OMR_TEMPLATE.studentIdStartX}, {OMR_TEMPLATE.studentIdStartY})</div>
              <div>Answers: ({OMR_TEMPLATE.answersStartX}, {OMR_TEMPLATE.answersStartY})</div>
              <div>Spacing X: {OMR_TEMPLATE.bubbleSpacingX}px</div>
              <div>Spacing Y: {OMR_TEMPLATE.bubbleSpacingY}px</div>
            </div>
          </div>
        </div>
        
        {/* Right: Preview & Results */}
        <div className="space-y-6">
          {/* Preview */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-2">Template Preview</h2>
            {previewImage && (
              <div className="border rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={previewImage}
                  alt="Test Template Preview"
                  className="w-full h-auto"
                />
              </div>
            )}
          </div>
          
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {/* Results */}
          {scanResult && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold mb-4">Scan Results</h2>
              
              {/* Accuracy summary */}
              {stats && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className={`p-4 rounded-lg ${stats.idAccuracy === 100 ? 'bg-green-50' : stats.idAccuracy >= 80 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                    <div className="text-2xl font-bold">{stats.idAccuracy}%</div>
                    <div className="text-sm text-gray-600">Student ID Accuracy</div>
                    <div className="text-xs text-gray-500">{stats.idDetails.matched}/{stats.idDetails.total} digits correct</div>
                  </div>
                  <div className={`p-4 rounded-lg ${stats.answerAccuracy === 100 ? 'bg-green-50' : stats.answerAccuracy >= 80 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                    <div className="text-2xl font-bold">{stats.answerAccuracy}%</div>
                    <div className="text-sm text-gray-600">Answer Accuracy</div>
                    <div className="text-xs text-gray-500">{stats.answerDetails.matched}/{stats.answerDetails.total} answers correct</div>
                  </div>
                </div>
              )}
              
              {/* Detailed comparison */}
              <div className="space-y-4">
                {/* Student ID comparison */}
                <div>
                  <h3 className="font-medium mb-2">Student ID Comparison</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Expected:</span>{' '}
                      <code className="bg-gray-100 px-2 py-0.5 rounded">{testStudentId.padStart(10, '0')}</code>
                    </div>
                    <div>
                      <span className="text-gray-500">Detected:</span>{' '}
                      <code className={`px-2 py-0.5 rounded ${
                        scanResult.student_id.student_id === testStudentId.padStart(10, '0') 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {scanResult.student_id.student_id}
                      </code>
                      <span className="text-gray-400 text-xs ml-1">
                        ({scanResult.student_id.confidence}% conf)
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Answer comparison */}
                <div>
                  <h3 className="font-medium mb-2">Answer Comparison</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-2 py-1 text-left">Q#</th>
                          <th className="px-2 py-1 text-left">Expected</th>
                          <th className="px-2 py-1 text-left">Detected</th>
                          <th className="px-2 py-1 text-left">Fill %</th>
                          <th className="px-2 py-1 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.answers.slice(0, numQuestions).map((ans, i) => {
                          const expected = testAnswers[i]
                          const detected = ans.detected_answers[0] || '—'
                          const match = expected === detected
                          return (
                            <tr key={i} className={match ? '' : 'bg-red-50'}>
                              <td className="px-2 py-1">{i + 1}</td>
                              <td className="px-2 py-1 font-mono">{expected}</td>
                              <td className="px-2 py-1 font-mono">{detected}</td>
                              <td className="px-2 py-1">{ans.filled_percentage}%</td>
                              <td className="px-2 py-1">
                                {match ? '✅' : '❌'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              
              {/* Raw result */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  View raw scan result
                </summary>
                <pre className="mt-2 bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(scanResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
