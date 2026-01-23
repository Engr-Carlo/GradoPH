import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm">
        <h1 className="text-6xl font-bold text-center mb-8">
          GradoPH
        </h1>
        <p className="text-xl text-center mb-12 text-gray-600">
          OMR Grading System for Philippine Schools
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Link 
            href="/login"
            className="p-6 border border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
          >
            <h2 className="text-2xl font-semibold mb-2">Login →</h2>
            <p className="text-gray-600">Access your teacher dashboard</p>
          </Link>
          
          <Link 
            href="/signup"
            className="p-6 border border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
          >
            <h2 className="text-2xl font-semibold mb-2">Sign Up →</h2>
            <p className="text-gray-600">Create a new teacher account</p>
          </Link>
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-lg font-semibold mb-4">Features</h3>
          <ul className="space-y-2 text-gray-600">
            <li>✓ Mobile scanner app for bubble sheets</li>
            <li>✓ 50-question multiple choice exams</li>
            <li>✓ Real-time results and analytics</li>
            <li>✓ CSV export for gradebooks</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
