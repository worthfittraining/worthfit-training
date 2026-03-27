'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Pages that bypass ALL checks
const BYPASS_PATHS = [
  '/subscribe',
  '/onboarding',
]

// Pages past_due users can still access (to fix their account)
const PAST_DUE_ALLOWED = [
  '/account',
]

const ACTIVE_STATUSES = ['trialing', 'active', 'past_due']

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [isPastDue, setIsPastDue] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  const isBypassed = BYPASS_PATHS.some(p => pathname.startsWith(p))
  const isPastDueAllowed = PAST_DUE_ALLOWED.some(p => pathname.startsWith(p))

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

        // Step 1: No profile at all → needs onboarding
        const hasProfile = profile && profile.Calories
        if (!hasProfile) {
          router.replace('/onboarding')
          return
        }

        // Step 2: Free plan users — always allowed through
        const plan = profile.Plan as string | undefined
        if (plan === 'free') {
          setChecked(true)
          return
        }

        // Step 3: Paid plan — check subscription status
        const status = profile.Subscription_Status as string | undefined
        const isComped = profile.Comp_Access === true || profile.Comp_Access === 'true' || profile.Comp_Access === 1

        if (isComped || ACTIVE_STATUSES.includes(status || '')) {
          if (status === 'past_due') {
            setIsPastDue(true)
          }
          setChecked(true)
        } else if (status === 'canceled' || (!status && plan !== 'free')) {
          // Canceled subscription or no plan set → show subscribe page
          router.replace('/subscribe')
        } else {
          // Unknown state — let them through
          setChecked(true)
        }
      } catch {
        // On error, allow through (don't block users due to network issues)
        setChecked(true)
      }
    }

    check()
  }, [isLoaded, user, pathname, isBypassed, router])

  async function openBillingPortal() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // ignore
    } finally {
      setPortalLoading(false)
    }
  }

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

  // Past due — show banner + hard gate (unless on an allowed page like /account)
  if (isPastDue && !isPastDueAllowed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Red warning banner */}
        <div className="bg-red-600 text-white px-4 py-3 text-center text-sm font-medium">
          ⚠️ Your payment didn't go through — update your card to restore access
        </div>

        {/* Hard gate content */}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-sm w-full text-center space-y-6">
            <div className="text-6xl">💳</div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Payment failed</h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                We couldn't process your last payment. Update your card to get back to your nutrition plan.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors"
              >
                {portalLoading ? 'Opening...' : 'Update Payment Method →'}
              </button>

              <a
                href="/account"
                className="block w-full py-3 border-2 border-gray-200 hover:border-gray-300 text-gray-600 font-medium rounded-2xl transition-colors text-sm"
              >
                Go to Account
              </a>

              <button
                onClick={() => signOut().then(() => router.push('/'))}
                className="block w-full text-center text-xs text-gray-400 hover:text-gray-500 py-1"
              >
                Sign out
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Questions? Email{' '}
              <a href="mailto:worthfittraining@gmail.com" className="underline">
                worthfittraining@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Past due but on an allowed page (/account) — show banner + page content
  if (isPastDue && isPastDueAllowed) {
    return (
      <>
        <div className="bg-red-600 text-white px-4 py-3 text-center text-sm font-medium sticky top-0 z-50">
          ⚠️ Payment failed —{' '}
          <button onClick={openBillingPortal} className="underline font-semibold">
            {portalLoading ? 'Opening...' : 'update your card'}
          </button>
          {' '}to restore access
        </div>
        {children}
      </>
    )
  }

  return <>{children}</>
}
