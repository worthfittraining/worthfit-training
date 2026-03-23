'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SubscribeSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    // Give webhook a moment to fire, then redirect to dashboard
    const timer = setTimeout(() => {
      router.push('/dashboard')
    }, 3000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h1>
        <p className="text-gray-500 mb-6">
          Your 7-day free trial has started. Welcome to WorthFit Training — let's build your best nutrition yet.
        </p>
        <div className="flex items-center justify-center gap-2 text-green-600 text-sm font-medium">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Taking you to your dashboard...
        </div>
      </div>
    </div>
  )
}
