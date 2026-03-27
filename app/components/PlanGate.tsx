'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { resolvePlan } from '@/lib/plan'
import type { Plan } from '@/lib/plan'

type FeatureKey = 'barcode' | 'photoLog' | 'mealPlan' | 'groceryList' | 'checkIns'

const PLAN_ORDER: Plan[] = ['free', 'standard', 'premium']
const REQUIRED_PLAN: Record<FeatureKey, Plan> = {
  barcode: 'standard',
  photoLog: 'standard',
  mealPlan: 'standard',
  groceryList: 'premium',
  checkIns: 'premium',
}

const FEATURE_LABELS: Record<FeatureKey, string> = {
  barcode: 'Barcode Scanner',
  photoLog: 'Photo Food Logging',
  mealPlan: 'AI Meal Plans',
  groceryList: 'Grocery List',
  checkIns: 'AI Check-ins',
}

const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  standard: 'Standard ($9.99/mo)',
  premium: 'Premium ($29.99/mo)',
}

function hasAccess(userPlan: Plan, required: Plan): boolean {
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(required)
}

type Props = {
  feature: FeatureKey
  children: React.ReactNode
}

export default function PlanGate({ feature, children }: Props) {
  const { user } = useUser()
  const [plan, setPlan] = useState<Plan | null>(null)

  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => setPlan(resolvePlan(d.Plan)))
      .catch(() => setPlan('free'))
  }, [user])

  // Still loading
  if (plan === null) {
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

  const required = REQUIRED_PLAN[feature]
  if (hasAccess(plan, required)) {
    return <>{children}</>
  }

  // Blocked — show upgrade wall
  const isPremiumRequired = required === 'premium'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-5xl">{isPremiumRequired ? '⭐' : '🔒'}</div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {FEATURE_LABELS[feature]} is a {PLAN_LABELS[required].split(' ')[0]} feature
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Upgrade to <strong>{PLAN_LABELS[required]}</strong> to unlock {FEATURE_LABELS[feature].toLowerCase()} and more.
          </p>
        </div>

        <div className="space-y-3">
          <a
            href="/subscribe"
            className="block w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-2xl transition-colors text-sm"
          >
            Upgrade Plan →
          </a>
          <a
            href="/dashboard"
            className="block w-full py-3 border-2 border-gray-200 hover:border-gray-300 text-gray-600 font-medium rounded-2xl transition-colors text-sm"
          >
            ← Back to Dashboard
          </a>
        </div>

        <p className="text-xs text-gray-400">
          Your current plan: <strong>{PLAN_LABELS[plan]}</strong>
        </p>
      </div>
    </div>
  )
}
