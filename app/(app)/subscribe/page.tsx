'use client'

import { useUser } from '@clerk/nextjs'
import { useState, useEffect } from 'react'

type PlanId = 'free' | 'standard' | 'premium'

type Tier = {
  id: PlanId
  label: string
  price: string
  period: string
  badge: string | null
  tagline: string
  priceId: string
  features: { text: string; included: boolean }[]
  cta: string
  highlight: boolean
}

const TIERS: Tier[] = [
  {
    id: 'free',
    label: 'Free',
    price: '$0',
    period: 'forever',
    badge: null,
    tagline: 'Start tracking today',
    priceId: '',
    features: [
      { text: 'Food logging (manual + search)', included: true },
      { text: '5 Nali messages per day', included: true },
      { text: 'Daily macro & calorie tracking', included: true },
      { text: 'Barcode scanner', included: false },
      { text: 'Photo food logging', included: false },
      { text: 'AI meal plans', included: false },
      { text: 'Grocery list', included: false },
      { text: 'AI check-ins with Nali', included: false },
    ],
    cta: 'Get Started Free',
    highlight: false,
  },
  {
    id: 'standard',
    label: 'Standard',
    price: '$9.99',
    period: '/month',
    badge: null,
    tagline: 'For serious trackers',
    priceId: process.env.NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID ?? '',
    features: [
      { text: 'Everything in Free', included: true },
      { text: '30 Nali messages per day', included: true },
      { text: 'Barcode scanner', included: true },
      { text: 'Photo food logging', included: true },
      { text: 'AI meal plans', included: true },
      { text: '24-hour Nali memory', included: true },
      { text: 'Grocery list', included: false },
      { text: 'AI check-ins with Nali', included: false },
    ],
    cta: 'Start 7-Day Free Trial',
    highlight: false,
  },
  {
    id: 'premium',
    label: 'Premium',
    price: '$29.99',
    period: '/month',
    badge: '⭐ Most Popular',
    tagline: 'The full experience',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? '',
    features: [
      { text: 'Everything in Standard', included: true },
      { text: 'Unlimited Nali messages', included: true },
      { text: '7-day Nali memory', included: true },
      { text: 'Grocery list', included: true },
      { text: 'Weekly AI check-ins', included: true },
      { text: 'Priority support', included: true },
      { text: 'Early access to new features', included: true },
      { text: 'Personalized coaching adjustments', included: true },
    ],
    cta: 'Start 7-Day Free Trial',
    highlight: true,
  },
]

export default function SubscribePage() {
  const { user } = useUser()
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState<PlanId | null>(null)
  const [error, setError] = useState('')

  // Fetch current plan so we can show "Current Plan" badge
  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => { if (d.Plan) setCurrentPlan(d.Plan) })
      .catch(() => {})
  }, [user])

  async function handleSelect(tier: Tier) {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return

    // Free plan — just navigate to dashboard (they already have free access after onboarding)
    if (tier.id === 'free') {
      window.location.href = '/dashboard'
      return
    }

    if (!tier.priceId) {
      setError('This plan is not yet available. Please contact support.')
      return
    }

    setLoading(tier.id)
    setError('')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, priceId: tier.priceId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-10 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-semibold px-4 py-2 rounded-full mb-4">
            💪 WorthFit Training
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Choose your plan</h1>
          <p className="text-gray-500 text-base">Start free, upgrade anytime. No commitment required.</p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {TIERS.map(tier => {
            const isCurrent = currentPlan === tier.id
            const isLoading = loading === tier.id

            return (
              <div
                key={tier.id}
                className={`relative rounded-3xl border-2 p-6 flex flex-col transition-all ${
                  tier.highlight
                    ? 'border-green-500 bg-white shadow-xl shadow-green-100'
                    : 'border-gray-200 bg-white shadow-sm'
                } ${isCurrent ? 'ring-2 ring-green-400' : ''}`}
              >
                {/* Badges */}
                {tier.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    {tier.badge}
                  </span>
                )}
                {isCurrent && !tier.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    Current Plan
                  </span>
                )}
                {isCurrent && tier.badge && (
                  <span className="absolute -top-3 right-4 bg-gray-800 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    Current
                  </span>
                )}

                {/* Plan name + price */}
                <div className="mb-5">
                  <p className="text-sm font-semibold text-gray-500 mb-1">{tier.label}</p>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-3xl font-bold text-gray-900">{tier.price}</span>
                    <span className="text-sm text-gray-400 pb-1">{tier.period}</span>
                  </div>
                  <p className="text-xs text-gray-500">{tier.tagline}</p>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-6 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className={f.included ? 'text-green-500 mt-0.5' : 'text-gray-300 mt-0.5'}>
                        {f.included ? '✓' : '✗'}
                      </span>
                      <span className={f.included ? 'text-gray-700' : 'text-gray-400'}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => handleSelect(tier)}
                  disabled={isLoading || isCurrent}
                  className={`w-full py-3 rounded-2xl font-semibold text-sm transition-colors ${
                    isCurrent
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : tier.highlight
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                      : 'bg-gray-900 hover:bg-gray-800 text-white'
                  } disabled:opacity-50`}
                >
                  {isLoading ? 'Loading...' : isCurrent ? 'Current Plan' : tier.cta}
                </button>

                {(tier.id === 'standard' || tier.id === 'premium') && !isCurrent && (
                  <p className="text-center text-xs text-gray-400 mt-2">7 days free, then {tier.price}/mo</p>
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center mb-4">{error}</p>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400">
          Cancel or change plans anytime from your account settings. Questions?{' '}
          <a href="mailto:worthfittraining@gmail.com" className="underline">worthfittraining@gmail.com</a>
        </p>
      </div>
    </div>
  )
}
