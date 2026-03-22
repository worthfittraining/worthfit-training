'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

const GOALS = [
  { value: 'weight_loss', label: '⚖️ Weight Loss' },
  { value: 'performance', label: '🏋️ Performance' },
  { value: 'maintenance', label: '🎯 Maintenance' },
  { value: 'body_recomp', label: '💪 Body Recomp' },
]

const RESTRICTIONS = [
  'gluten_free', 'dairy_free', 'vegan', 'vegetarian',
  'nut_allergy', 'halal', 'kosher', 'other'
]

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Desk job, little or no exercise' },
  { value: 'light', label: 'Light', desc: 'Light exercise 1–3x/week' },
  { value: 'moderate', label: 'Moderate', desc: 'Moderate exercise 3–5x/week' },
  { value: 'active', label: 'Active', desc: 'Hard exercise 6–7x/week' },
  { value: 'very_active', label: 'Very Active', desc: 'Physical job + hard training' },
]

export default function OnboardingPage() {
  const { user } = useUser()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    goal: '',
    restrictions: [] as string[],
    height_in: '',
    weight_lbs: '',
    age: '',
    sex: '',
    activity_level: '',
  })

  const totalSteps = 4

  function toggleRestriction(r: string) {
    setForm(f => ({
      ...f,
      restrictions: f.restrictions.includes(r)
        ? f.restrictions.filter(x => x !== r)
        : [...f.restrictions, r],
    }))
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          email: user?.primaryEmailAddress?.emailAddress,
          name: user?.fullName || user?.firstName || 'Friend',
        }),
      })
      if (res.ok) {
        router.push('/dashboard')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-lg">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-green-50 rounded-full px-4 py-2">
            <span className="text-green-600 font-bold text-sm">💪 WorthFit Training</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${i < step ? 'bg-green-500' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {/* Step 1: Goal */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">What's your primary goal?</h2>
            <p className="text-gray-500 mb-6">This shapes everything — your calories, macros, and meal plans.</p>
            <div className="grid grid-cols-2 gap-3">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setForm(f => ({ ...f, goal: g.value }))}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    form.goal === g.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{g.label.split(' ')[0]}</div>
                  <div className="font-medium text-gray-800">{g.label.split(' ').slice(1).join(' ')}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Restrictions */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Any dietary restrictions?</h2>
            <p className="text-gray-500 mb-6">Select all that apply. We'll filter every suggestion automatically.</p>
            <div className="flex flex-wrap gap-2">
              {RESTRICTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => toggleRestriction(r)}
                  className={`px-4 py-2 rounded-full border-2 capitalize transition ${
                    form.restrictions.includes(r)
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-green-300 text-gray-600'
                  }`}
                >
                  {r.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Stats */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Let's calculate your targets</h2>
            <p className="text-gray-500 mb-6">We use these to calculate your daily calories and macros — not Claude.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Height (inches)</label>
                  <input
                    type="number"
                    placeholder="e.g. 65"
                    value={form.height_in}
                    onChange={e => setForm(f => ({ ...f, height_in: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
                  <input
                    type="number"
                    placeholder="e.g. 150"
                    value={form.weight_lbs}
                    onChange={e => setForm(f => ({ ...f, weight_lbs: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-green-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                  <input
                    type="number"
                    placeholder="e.g. 30"
                    value={form.age}
                    onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
                  <select
                    value={form.sex}
                    onChange={e => setForm(f => ({ ...f, sex: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-green-500 outline-none"
                  >
                    <option value="">Select...</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Activity Level */}
        {step === 4 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">How active are you?</h2>
            <p className="text-gray-500 mb-6">Be honest — this directly affects your calorie target.</p>
            <div className="space-y-3">
              {ACTIVITY_LEVELS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setForm(f => ({ ...f, activity_level: a.value }))}
                  className={`w-full p-4 rounded-xl border-2 text-left transition ${
                    form.activity_level === a.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="font-semibold text-gray-800">{a.label}</div>
                  <div className="text-sm text-gray-500">{a.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-6 py-3 border-2 border-gray-200 rounded-full text-gray-600 hover:border-gray-300 transition"
            >
              Back
            </button>
          ) : <div />}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={
                (step === 1 && !form.goal) ||
                (step === 3 && (!form.height_in || !form.weight_lbs || !form.age || !form.sex))
              }
              className="px-6 py-3 bg-green-600 text-white rounded-full font-semibold hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!form.activity_level || loading}
              className="px-6 py-3 bg-green-600 text-white rounded-full font-semibold hover:bg-green-700 transition disabled:opacity-40"
            >
              {loading ? 'Setting up your profile...' : 'Build My Plan →'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}