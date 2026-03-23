'use client'

import { useUser } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Pages that bypass the subscription check
const BYPASS_PATHS = [
  '/subscribe',
  '/onboarding',
]

const ACTIVE_STATUSES = ['trialing', 'active']

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  const isBypassed = BYPASS_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (!isLoaded) return
    if (isBypassed) { setChecked(true); return }
    if (!user?.primaryEmailAddress?.emailAddress) return

    async function check() {
      try {
        const email = user!.primaryEmailAddress!.emailAddress
        const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`)
        if (!res.ok) { setChecked(true); return }
        const profile = await res.json()

        const status = profile.Subscription_Status as string | undefined
        const isComped = profile.Comp_Access === true || profile.Comp_Access === 'true' || profile.Comp_Access === 1

        if (isComped || ACTIVE_STATUSES.includes(status || '')) {
          setChecked(true)
        } else {
          router.replace('/subscribe')
        }
      } catch {
        // On error, allow through (don't block users due to network issues)
        setChecked(true)
      }
    }

    check()
  }, [isLoaded, user, pathname, isBypassed, router])

  // Show nothing while checking (avoids flash of content)
  if (!checked && !isBypassed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Loading...
        </div>
      </div>
    )
  }

  return <>{children}</>
}
