'use client'

import { SignUp } from '@clerk/nextjs'
import { useEffect } from 'react'

export default function SignUpPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const coachEmail = new URLSearchParams(window.location.search).get('coach')
      if (coachEmail && coachEmail.includes('@')) {
        localStorage.setItem('pending_coach_email', coachEmail)
      }
    }
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignUp />
    </main>
  )
}
