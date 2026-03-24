'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Profile = {
  Name?: string
  Goal?: string
  Calories?: number
  Protein_g?: number
  Carbs_g?: number
  Fat_g?: number
  Activity_Level?: string
  Preferences?: string
  Dislikes?: string
  Subscription_Status?: string
  Trial_End?: string
  Comp_Access?: boolean
  Stripe_Customer_Id?: string
}

const GOAL_LABELS: Record<string, string> = {
  weight_loss: '⚖️ Weight Loss',
  performance: '🏋️ Performance',
  maintenance: '🎯 Maintenance',
  body_recomp: '💪 Body Recomp',
}

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'Sedentary',
  light: 'Light',
  moderate: 'Moderate',
  active: 'Active',
  very_active: 'Very Active',
}

function StatusBadge({ profile }: { profile: Profile }) {
  const status = profile.Subscription_Status
  const isComp = profile.Comp_Access

  if (isComp) {
    return <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full">✨ Comp Access</span>
  }
  if (status === 'active') {
    return <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">✅ Active</span>
  }
  if (status === 'trialing') {
    const trialEnd = profile.Trial_End ? new Date(profile.Trial_End) : null
    const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
    return (
      <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full">
        🕐 Trial{daysLeft && daysLeft > 0 ? ` · ${daysLeft}d left` : ''}
      </span>
    )
  }
  if (status === 'past_due') {
    return <span className="bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full">⚠️ Payment Due</span>
  }
  return <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">Free</span>
}

export default function AccountPage() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()

  const [profile, setProfile] = useState<Profile>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)

  // Editable fields
  const [preferences, setPreferences] = useState('')
  const [dislikes, setDislikes] = useState('')

  const email = user?.primaryEmailAddress?.emailAddress

  useEffect(() => {
    if (!email) return
    fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data)
        setPreferences(data.Preferences || '')
        setDislikes(data.Dislikes || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [email])

  async function savePreferences() {
    if (!email) return
    setSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, Preferences: preferences, Dislikes: dislikes }),
      })
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch {
      setSaveMsg('Error saving')
    } finally {
      setSaving(false)
    }
  }

  async function openBillingPortal() {
    if (!email) return
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Could not open billing portal.')
      }
    } catch {
      alert('Something went wrong.')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  const initials = user?.firstName?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || '?'
  const displayName = user?.fullName || user?.firstName || email?.split('@')[0] || 'You'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center text-white text-xl font-bold shadow">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-sm text-gray-500">{email}</p>
          </div>
        </div>

        {/* Subscription Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Subscription</h2>
            {!loading && <StatusBadge profile={profile} />}
          </div>

          {loading ? (
            <div className="h-8 bg-gray-100 rounded animate-pulse w-1/2" />
          ) : profile.Comp_Access ? (
            <p className="text-sm text-gray-500">You have complimentary access. Enjoy!</p>
          ) : profile.Subscription_Status === 'active' || profile.Subscription_Status === 'trialing' ? (
            <button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="w-full mt-1 py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {portalLoading ? 'Opening...' : 'Manage Billing & Subscription →'}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">You don't have an active subscription.</p>
              <a
                href="/subscribe"
                className="block text-center py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                View Plans →
              </a>
            </div>
          )}
        </div>

        {/* My Plan Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="font-semibold text-gray-800 mb-3">My Plan</h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Goal</span>
                <span className="text-sm font-medium text-gray-800">
                  {GOAL_LABELS[profile.Goal || ''] || profile.Goal || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Activity</span>
                <span className="text-sm font-medium text-gray-800">
                  {ACTIVITY_LABELS[profile.Activity_Level || ''] || profile.Activity_Level || '—'}
                </span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Calories', value: profile.Calories, unit: '' },
                  { label: 'Protein', value: profile.Protein_g, unit: 'g' },
                  { label: 'Carbs', value: profile.Carbs_g, unit: 'g' },
                  { label: 'Fat', value: profile.Fat_g, unit: 'g' },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 rounded-xl py-2">
                    <div className="text-sm font-bold text-gray-900">{m.value ?? '—'}{m.unit}</div>
                    <div className="text-xs text-gray-400">{m.label}</div>
                  </div>
                ))}
              </div>
              <a
                href="/onboarding"
                className="block text-center text-sm text-green-600 font-medium pt-1 hover:text-green-700"
              >
                Redo onboarding to update targets →
              </a>
            </div>
          )}
        </div>

        {/* Food Preferences Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Food Preferences</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Foods I love</label>
              <input
                type="text"
                value={preferences}
                onChange={e => setPreferences(e.target.value)}
                placeholder="e.g. chicken, rice, eggs..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Foods I dislike / avoid</label>
              <input
                type="text"
                value={dislikes}
                onChange={e => setDislikes(e.target.value)}
                placeholder="e.g. tuna, Brussels sprouts..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <button
              onClick={savePreferences}
              disabled={saving}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Saving...' : saveMsg || 'Save Preferences'}
            </button>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          <a href="/resources" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-t-2xl">
            <div className="flex items-center gap-3">
              <span className="text-lg">📚</span>
              <span className="text-sm font-medium text-gray-700">Nutrition Resources</span>
            </div>
            <span className="text-gray-300 text-sm">→</span>
          </a>
          <a href="/subscribe" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-lg">💳</span>
              <span className="text-sm font-medium text-gray-700">View Plans</span>
            </div>
            <span className="text-gray-300 text-sm">→</span>
          </a>
          <a href="mailto:worthfittraining@gmail.com" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-b-2xl">
            <div className="flex items-center gap-3">
              <span className="text-lg">💬</span>
              <span className="text-sm font-medium text-gray-700">Contact Coach</span>
            </div>
            <span className="text-gray-300 text-sm">→</span>
          </a>
        </div>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 border-2 border-gray-200 hover:border-red-200 hover:text-red-500 text-gray-500 text-sm font-semibold rounded-2xl transition-colors"
        >
          Sign Out
        </button>

        <p className="text-center text-xs text-gray-300 pb-2">WorthFit Training · Powered by Nali</p>
      </div>
    </div>
  )
}
