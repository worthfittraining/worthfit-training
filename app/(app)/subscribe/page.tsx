'use client'

import { useUser } from '@clerk/nextjs'
import { useState } from 'react'

const PLANS = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: '$29',
    period: '/month',
    priceId: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID!,
    badge: null,
    savings: null,
  },
  {
    id: 'annual',
    label: 'Annual',
    price: '$249',
    period: '/year',
    priceId: process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID!,
    badge: '🎉 Best Value',
    savings: 'Save $99 vs monthly',
  },
]

const FEATURES = [
  '✅ AI-powered personalized meal plans',
  '✅ Daily macro & calorie tracking',
  '✅ Chat with Nali, your AI nutrition coach',
  '✅ Barcode scanner & photo logging',
  '✅ Recipe saving & search',
  '✅ Carb cycling & custom macro targets',
  '✅ Exclusive resources & guides',
]

export default function SubscribePage() {
  const { user } = useUser()
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubscribe() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    setLoading(true)
    setError('')
    try {
      const plan = PLANS.find(p => p.id === selectedPlan)!
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, priceId: plan.priceId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-semibold px-4 py-2 rounded-full mb-4">
            💪 WorthFit Training
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Start your free trial</h1>
          <p className="text-gray-500 text-base">7 days free — then just pick a plan. Cancel anytime.</p>
        </div>

        {/* Plan toggle */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {PLANS.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id as 'monthly' | 'annual')}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                selectedPlan === plan.id
                  ? 'border-green-500 bg-green-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-green-300'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-0.5 rounded-full whitespace-nowrap">
                  {plan.badge}
                </span>
              )}
              <p className="font-semibold text-gray-700 text-sm mb-1">{plan.label}</p>
              <p className="text-2xl font-bold text-gray-900">{plan.price}</p>
              <p className="text-xs text-gray-400">{plan.period}</p>
              {plan.savings && (
                <p className="text-xs text-green-600 font-semibold mt-1">{plan.savings}</p>
              )}
            </button>
          ))}
        </div>

        {/* Features */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Everything included:</p>
          <ul className="space-y-2">
            {FEATURES.map(f => (
              <li key={f} className="text-sm text-gray-600">{f}</li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        {error && <p className="text-red-500 text-sm text-center mb-3">{error}</p>}
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-2xl text-base transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {loading ? 'Loading...' : 'Start 7-Day Free Trial →'}
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">
          No charge for 7 days. Have a discount code? Enter it at checkout.
        </p>

      </div>
    </div>
  )
}
