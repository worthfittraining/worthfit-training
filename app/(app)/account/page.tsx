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
  Plan?: string
  Trial_End?: string
  Comp_Access?: boolean
  Playbook_Active?: boolean
  Stripe_Customer_Id?: string
  // Stats used for macro recalculation
  height_in?: number
  Weight_lbs?: number
  Age?: number
  Sex?: string
  breastfeeding?: boolean
  // Rest day macro targets
  Rest_Calories?: number
  Rest_Protein_g?: number
  Rest_Carbs_g?: number
  Rest_Fat_g?: number
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

const GOALS = [
  { value: 'weight_loss', label: '⚖️ Weight Loss' },
  { value: 'performance', label: '🏋️ Performance' },
  { value: 'maintenance', label: '🎯 Maintenance' },
  { value: 'body_recomp', label: '💪 Body Recomp' },
]

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very Active' },
]

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
  // Playbook members get Standard access without a Stripe subscription
  if (profile.Playbook_Active) return <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">✅ Standard</span>
  // Paid plan without an active Stripe status (e.g. manually set in Airtable)
  if (profile.Plan === 'premium') return <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">✅ Premium</span>
  if (profile.Plan === 'standard') return <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">✅ Standard</span>
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

  // Macro recalculator
  const [showRecalc, setShowRecalc] = useState(false)
  const [recalcForm, setRecalcForm] = useState({ height_in: '', weight_lbs: '', age: '', sex: '', goal: '', activity_level: '', breastfeeding: false })
  const [recalcSaving, setRecalcSaving] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState('')

  // Rest day macros
  const [showRestDay, setShowRestDay] = useState(false)
  const [restForm, setRestForm] = useState({ calories: '', protein_g: '', carbs_g: '', fat_g: '' })
  const [restSaving, setRestSaving] = useState(false)
  const [restMsg, setRestMsg] = useState('')

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
        // Pre-fill recalculator with existing stats
        setRecalcForm({
          height_in: data.height_in ? String(data.height_in) : '',
          weight_lbs: data.Weight_lbs ? String(data.Weight_lbs) : '',
          age: data.Age ? String(data.Age) : '',
          sex: data.Sex || '',
          goal: data.Goal || '',
          activity_level: data.Activity_Level || '',
          breastfeeding: !!data.breastfeeding,
        })
        // Pre-fill rest day targets if set
        setRestForm({
          calories: data.Rest_Calories ? String(data.Rest_Calories) : '',
          protein_g: data.Rest_Protein_g ? String(data.Rest_Protein_g) : '',
          carbs_g: data.Rest_Carbs_g ? String(data.Rest_Carbs_g) : '',
          fat_g: data.Rest_Fat_g ? String(data.Rest_Fat_g) : '',
        })
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
      // Keep profile state in sync
      setProfile(prev => ({ ...prev, Name: `${firstName.trim()} ${lastName.trim()}`.trim(), DOB: dob }))
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
      // Keep profile state in sync so Nali's next chat uses fresh preferences
      setProfile(prev => ({ ...prev, Preferences: preferences, Dislikes: dislikes }))
      setPrefMsg('Saved!')
      setTimeout(() => setPrefMsg(''), 2500)
    } catch {
      setPrefMsg('Error saving')
    } finally {
      setPrefSaving(false)
    }
  }

  async function recalculateMacros() {
    if (!email) return
    const { height_in, weight_lbs, age, sex, goal, activity_level, breastfeeding } = recalcForm
    if (!height_in || !weight_lbs || !age || !sex || !goal || !activity_level) {
      setRecalcMsg('Please fill in all fields')
      return
    }
    setRecalcSaving(true)
    setRecalcMsg('')
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: profile.Name || `${firstName} ${lastName}`.trim() || 'Friend',
          goal,
          restrictions: [],
          food_preferences: profile.Preferences || '',
          food_dislikes: profile.Dislikes || '',
          height_in,
          weight_lbs,
          age,
          sex,
          activity_level,
          breastfeeding,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        // Refresh profile to show updated macros
        const refreshed = await fetch(`/api/profile?email=${encodeURIComponent(email)}`)
        if (refreshed.ok) setProfile(await refreshed.json())
        setRecalcMsg('✅ Targets updated!')
        setTimeout(() => { setRecalcMsg(''); setShowRecalc(false) }, 2000)
      } else {
        setRecalcMsg('Error — try again')
      }
    } catch {
      setRecalcMsg('Error — try again')
    } finally {
      setRecalcSaving(false)
    }
  }

  async function saveRestDay() {
    if (!email) return
    setRestSaving(true)
    setRestMsg('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          Rest_Calories: restForm.calories ? Number(restForm.calories) : null,
          Rest_Protein_g: restForm.protein_g ? Number(restForm.protein_g) : null,
          Rest_Carbs_g: restForm.carbs_g ? Number(restForm.carbs_g) : null,
          Rest_Fat_g: restForm.fat_g ? Number(restForm.fat_g) : null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setRestMsg('✅ Rest day targets saved!')
      setTimeout(() => { setRestMsg(''); setShowRestDay(false) }, 2000)
    } catch {
      setRestMsg('❌ Failed to save — please try again')
    } finally {
      setRestSaving(false)
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
          {photoUploading && <p className="text-center text-xs text-gray-500 mb-3">Uploading photo...</p>}

          {/* Name */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
              />
            </div>
          </div>

          {/* Email — read only */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <div className="flex items-center gap-2 border border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5">
              <span className="text-sm text-gray-500 flex-1 truncate">{email}</span>
              <span className="text-xs text-gray-500 shrink-0">via login</span>
            </div>
          </div>

          {/* Date of birth */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Date of birth</label>
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
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
          ) : profile.Playbook_Active && !profile.Subscription_Status ? (
            // Playbook members get Standard via Playbook — no Stripe subscription to manage
            <p className="text-sm text-gray-500">Your Standard access is included with your Playbook membership. 🎉</p>
          ) : profile.Subscription_Status === 'active' || profile.Subscription_Status === 'trialing' || profile.Subscription_Status === 'past_due' ? (
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">My Macros</h2>
            <button
              onClick={() => setShowRecalc(r => !r)}
              className="text-xs text-green-600 font-medium hover:text-green-700 transition-colors"
            >
              {showRecalc ? 'Hide ↑' : '✏️ Update Targets'}
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : (
            <>
              <div className="space-y-2.5 mb-3">
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
                      <div className="text-xs text-gray-500">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {showRecalc && (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs text-gray-500">Update your stats to recalculate targets</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Height (inches)</label>
                      <input type="number" placeholder="e.g. 65" value={recalcForm.height_in}
                        onChange={e => setRecalcForm(p => ({ ...p, height_in: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Weight (lbs)</label>
                      <input type="number" placeholder="e.g. 150" value={recalcForm.weight_lbs}
                        onChange={e => setRecalcForm(p => ({ ...p, weight_lbs: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Age</label>
                      <input type="number" placeholder="e.g. 30" value={recalcForm.age}
                        onChange={e => setRecalcForm(p => ({ ...p, age: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Sex</label>
                      <select value={recalcForm.sex} onChange={e => setRecalcForm(p => ({ ...p, sex: e.target.value }))}
                        className={`w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${!recalcForm.sex ? 'text-gray-500' : 'text-gray-800'}`}>
                        <option value="" disabled>Select...</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Goal</label>
                    <select value={recalcForm.goal} onChange={e => setRecalcForm(p => ({ ...p, goal: e.target.value }))}
                      className={`w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${!recalcForm.goal ? 'text-gray-500' : 'text-gray-800'}`}>
                      <option value="" disabled>Select goal...</option>
                      {GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Activity level</label>
                    <select value={recalcForm.activity_level} onChange={e => setRecalcForm(p => ({ ...p, activity_level: e.target.value }))}
                      className={`w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${!recalcForm.activity_level ? 'text-gray-500' : 'text-gray-800'}`}>
                      <option value="" disabled>Select level...</option>
                      {ACTIVITY_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                  {recalcForm.sex === 'female' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={recalcForm.breastfeeding}
                        onChange={e => setRecalcForm(p => ({ ...p, breastfeeding: e.target.checked }))}
                        className="w-4 h-4 accent-green-600" />
                      <span className="text-sm text-gray-700">Currently breastfeeding (+500 cal/day)</span>
                    </label>
                  )}
                  {recalcMsg && <p className={`text-sm font-medium ${recalcMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{recalcMsg}</p>}
                  <button onClick={recalculateMacros} disabled={recalcSaving}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
                    {recalcSaving ? 'Calculating...' : '🔄 Calculate New Targets'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Rest Day Macros ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-semibold text-gray-800">Rest Day Macros</h2>
              <p className="text-xs text-gray-500 mt-0.5">Lower targets for non-training days</p>
            </div>
            <button
              onClick={() => setShowRestDay(r => !r)}
              className="text-xs text-green-600 font-medium hover:text-green-700 transition-colors"
            >
              {showRestDay ? 'Hide ↑' : '✏️ Set Targets'}
            </button>
          </div>

          {!showRestDay && profile.Rest_Calories && (
            <div className="grid grid-cols-4 gap-2 text-center mt-3">
              {[
                { label: 'Calories', value: profile.Rest_Calories, unit: '' },
                { label: 'Protein', value: profile.Rest_Protein_g, unit: 'g' },
                { label: 'Carbs', value: profile.Rest_Carbs_g, unit: 'g' },
                { label: 'Fat', value: profile.Rest_Fat_g, unit: 'g' },
              ].map(m => (
                <div key={m.label} className="bg-blue-50 rounded-xl py-2">
                  <div className="text-sm font-bold text-gray-900">{m.value ?? '—'}{m.unit}</div>
                  <div className="text-xs text-gray-500">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {!showRestDay && !profile.Rest_Calories && (
            <p className="text-sm text-gray-500 mt-2">No rest day targets set — toggle above to add them.</p>
          )}

          {showRestDay && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500">These targets appear on your food log when you toggle "Rest Day". Leave blank to disable.</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['Calories', 'calories', 'kcal'],
                  ['Protein', 'protein_g', 'g'],
                  ['Carbs', 'carbs_g', 'g'],
                  ['Fat', 'fat_g', 'g'],
                ] as const).map(([label, key, unit]) => (
                  <div key={key}>
                    <label className="text-xs font-medium text-gray-500 block mb-1">{label} ({unit})</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={restForm[key]}
                      onChange={e => setRestForm(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800"
                    />
                  </div>
                ))}
              </div>
              {restMsg && <p className={`text-sm font-medium ${restMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{restMsg}</p>}
              <button
                onClick={saveRestDay}
                disabled={restSaving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {restSaving ? 'Saving...' : '💾 Save Rest Day Targets'}
              </button>
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
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Foods I dislike / avoid</label>
              <input
                type="text"
                value={dislikes}
                onChange={e => setDislikes(e.target.value)}
                placeholder="e.g. tuna, Brussels sprouts..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
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
          <a href="/recipes" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-t-2xl">
            <div className="flex items-center gap-3"><span className="text-lg">🍳</span><span className="text-sm font-medium text-gray-700">My Recipes</span></div>
            <span className="text-gray-500 text-sm">→</span>
          </a>
          <a href="/resources" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3"><span className="text-lg">📚</span><span className="text-sm font-medium text-gray-700">Nutrition Resources</span></div>
            <span className="text-gray-500 text-sm">→</span>
          </a>
          <a href="/subscribe" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3"><span className="text-lg">💳</span><span className="text-sm font-medium text-gray-700">View Plans</span></div>
            <span className="text-gray-500 text-sm">→</span>
          </a>
          <a href="mailto:worthfittraining@gmail.com" className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-b-2xl">
            <div className="flex items-center gap-3"><span className="text-lg">💬</span><span className="text-sm font-medium text-gray-700">Contact Support</span></div>
            <span className="text-gray-500 text-sm">→</span>
          </a>
        </div>

        {/* ── Sign Out ── */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 border-2 border-gray-200 hover:border-red-200 hover:text-red-500 text-gray-500 text-sm font-semibold rounded-2xl transition-colors"
        >
          Sign Out
        </button>

        <p className="text-center text-xs text-gray-500 pb-2">Nutrition by Nali</p>
      </div>
    </div>
  )
}
