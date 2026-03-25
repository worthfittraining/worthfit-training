'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import { useState, useEffect, useRef } from 'react'
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
  DOB?: string
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
  if (isComp) return <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full">✨ Comp Access</span>
  if (status === 'active') return <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">✅ Active</span>
  if (status === 'trialing') {
    const trialEnd = profile.Trial_End ? new Date(profile.Trial_End) : null
    const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
    return <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full">🕐 Trial{daysLeft && daysLeft > 0 ? ` · ${daysLeft}d left` : ''}</span>
  }
  if (status === 'past_due') return <span className="bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full">⚠️ Payment Due</span>
  return <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">Free</span>
}

export default function AccountPage() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<Profile>({})
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  // Profile fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Photo
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Food preferences
  const [preferences, setPreferences] = useState('')
  const [dislikes, setDislikes] = useState('')
  const [prefSaving, setPrefSaving] = useState(false)
  const [prefMsg, setPrefMsg] = useState('')

  const email = user?.primaryEmailAddress?.emailAddress

  useEffect(() => {
    if (!user) return
    setFirstName(user.firstName || '')
    setLastName(user.lastName || '')
  }, [user])

  useEffect(() => {
    if (!email) return
    fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data)
        setPreferences(data.Preferences || '')
        setDislikes(data.Dislikes || '')
        setDob(data.DOB || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [email])

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    // Show preview immediately
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    setPhotoUploading(true)
    try {
      await user.setProfileImage({ file })
      await user.reload()
    } catch (err) {
      console.error('Photo upload failed:', err)
      setPhotoPreview(null)
    } finally {
      setPhotoUploading(false)
    }
  }

  async function saveProfile() {
    if (!user || !email) return
    setProfileSaving(true)
    try {
      // Update name in Clerk
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() })
      // Update DOB + Name in Airtable
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          Name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          DOB: dob,
        }),
      })
      setProfileMsg('Saved!')
      setTimeout(() => setProfileMsg(''), 2500)
    } catch (err) {
      console.error(err)
      setProfileMsg('Error saving')
    } finally {
      setProfileSaving(false)
    }
  }

  async function savePreferences() {
    if (!email) return
    setPrefSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, Preferences: preferences, Dislikes: dislikes }),
      })
      setPrefMsg('Saved!')
      setTimeout(() => setPrefMsg(''), 2500)
    } catch {
      setPrefMsg('Error saving')
    } finally {
      setPrefSaving(false)
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
      if (data.url) window.location.href = data.url
      else alert(data.error || 'Could not open billing portal.')
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

  const photoSrc = photoPreview || user?.imageUrl
  const initials = (firstName?.[0] || email?.[0] || '?').toUpperCase()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        <h1 className="text-2xl font-bold text-gray-800">Account</h1>

        {/* ── Profile Card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">My Profile</h2>

          {/* Photo */}
          <div className="flex justify-center mb-5">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="relative group"
              disabled={photoUploading}
            >
              <div className="w-24 h-24 rounded-full overflow-hidden bg-green-500 flex items-center justify-center shadow-md">
                {photoSrc ? (
                  <img src={photoSrc} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-white">{initials}</span>
                )}
              </div>
              {/* Camera overlay */}
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xl">{photoUploading ? '⏳' : '📷'}</span>
              </div>
              {/* Edit badge */}
              <div className="absolute bottom-0 right-0 w-7 h-7 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow">
                <span className="text-white text-xs">✏️</span>
              </div>
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          {photoUploading && <p className="text-center text-xs text-gray-400 mb-3">Uploading photo...</p>}

          {/* Name */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Email — read only */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <div className="flex items-center gap-2 border border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5">
              <span className="text-sm text-gray-500 flex-1 truncate">{email}</span>
              <span className="text-xs text-gray-400 shrink-0">via login</span>
            </div>
          </div>

          {/* Date of birth */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Date of birth</label>
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={profileSaving}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {profileSaving ? 'Saving...' : profileMsg || 'Save Profile'}
          </button>
        </div>

        {/* ── Subscription Card ── */}
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
              <p className="text-sm text-gray-500">You don&apos;t have an active subscription.</p>
              <a href="/subscribe" className="block text-center py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">
                View Plans →
              </a>
            </div>
          )}
        </div>

        {/* ── My Plan Card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="font-semibold text-gray-800 mb-3">My Plan</h2>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Goal</span>
                <span className="text-sm font-medium text-gray-800">{GOAL_LABELS[profile.Goal || ''] || profile.Goal || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Activity</span>
                <span className="text-sm font-medium text-gray-800">{ACTIVITY_LABELS[profile.Activity_Level || ''] || profile.Activity_Level || '—'}</span>
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
              <a href="/onboarding" className="block text-center text-sm text-green-600 font-medium pt-1 hover:text-green-700">
                Redo onboarding to update targets →
              </a>
            </div>
          )}
        </div>

        {/* ── Food Preferences ── */}
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
              disabled={prefSaving}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {prefSaving ? 'Saving...' : prefMsg || 'Save Preferences'}
            </button>
          </div>
        </div>

        {/* ── Quick Links ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          <a href="/resources" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-t-2xl">
            <div className="flex items-center gap-3"><span className="text-lg">📚</span><span className="text-sm font-medium text-gray-700">Nutrition Resources</span></div>
            <span className="text-gray-300 text-sm">→</span>
          </a>
          <a href="/subscribe" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3"><span className="text-lg">💳</span><span className="text-sm font-medium text-gray-700">View Plans</span></div>
            <span className="text-gray-300 text-sm">→</span>
          </a>
          <a href="mailto:worthfittraining@gmail.com" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-b-2xl">
            <div className="flex items-center gap-3"><span className="text-lg">💬</span><span className="text-sm font-medium text-gray-700">Contact Coach</span></div>
            <span className="text-gray-300 text-sm">→</span>
          </a>
        </div>

        {/* ── Sign Out ── */}
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
