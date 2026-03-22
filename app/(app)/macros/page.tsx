'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type DayMacros = {
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

type WeeklyMacros = Record<string, DayMacros>

const emptyDay = (): DayMacros => ({ calories: '', protein_g: '', carbs_g: '', fat_g: '' })

export default function MacrosPage() {
  const { user } = useUser()
  const [defaultMacros, setDefaultMacros] = useState<DayMacros>({ calories: '2000', protein_g: '150', carbs_g: '200', fat_g: '65' })
  const [weekly, setWeekly] = useState<WeeklyMacros>(() => Object.fromEntries(DAYS.map(d => [d, emptyDay()])))
  const [usePerDay, setUsePerDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const todayName = DAYS[(new Date().getDay() + 6) % 7] // Mon=0 index

  useEffect(() => {
    async function load() {
      if (!user?.primaryEmailAddress?.emailAddress) return
      const email = user.primaryEmailAddress.emailAddress
      try {
        const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`)
        if (res.ok) {
          const profile = await res.json()
          if (profile.Calories) {
            setDefaultMacros({
              calories: String(profile.Calories || 2000),
              protein_g: String(profile.Protein_g || 150),
              carbs_g: String(profile.Carbs_g || 200),
              fat_g: String(profile.Fat_g || 65),
            })
          }
          if (profile.Weekly_Macros) {
            try {
              const parsed = JSON.parse(profile.Weekly_Macros)
              setWeekly(prev => {
                const merged = { ...prev }
                for (const day of DAYS) {
                  if (parsed[day]) {
                    merged[day] = {
                      calories: String(parsed[day].calories || ''),
                      protein_g: String(parsed[day].protein_g || ''),
                      carbs_g: String(parsed[day].carbs_g || ''),
                      fat_g: String(parsed[day].fat_g || ''),
                    }
                  }
                }
                return merged
              })
              setUsePerDay(true)
            } catch { /* ignore parse errors */ }
          }
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [user])

  function updateDay(day: string, field: keyof DayMacros, value: string) {
    setWeekly(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
  }

  function copyDefaultToAll() {
    const filled = Object.fromEntries(DAYS.map(d => [d, { ...defaultMacros }]))
    setWeekly(filled)
  }

  async function handleSave() {
    if (!user?.primaryEmailAddress?.emailAddress) return
    setSaving(true)
    try {
      const email = user.primaryEmailAddress.emailAddress

      // Save default macros
      const body: Record<string, unknown> = {
        email,
        Calories: Number(defaultMacros.calories),
        Protein_g: Number(defaultMacros.protein_g),
        Carbs_g: Number(defaultMacros.carbs_g),
        Fat_g: Number(defaultMacros.fat_g),
      }

      // Save weekly macros if enabled
      if (usePerDay) {
        const weeklyObj: Record<string, Record<string, number>> = {}
        for (const day of DAYS) {
          const d = weekly[day]
          if (d.calories || d.protein_g || d.carbs_g || d.fat_g) {
            weeklyObj[day] = {
              calories: Number(d.calories) || Number(defaultMacros.calories),
              protein_g: Number(d.protein_g) || Number(defaultMacros.protein_g),
              carbs_g: Number(d.carbs_g) || Number(defaultMacros.carbs_g),
              fat_g: Number(d.fat_g) || Number(defaultMacros.fat_g),
            }
          }
        }
        body.Weekly_Macros = JSON.stringify(weeklyObj)
      } else {
        body.Weekly_Macros = ''
      }

      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ }
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Loading your macros...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Back</a>
          <h1 className="text-lg font-bold text-gray-800">🎯 My Macro Targets</h1>
          <div className="w-12" />
        </div>

        {/* Default macros */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Default Daily Macros</h2>
          <p className="text-xs text-gray-400 mb-3">Used on any day without specific targets set</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'calories', label: 'Calories', unit: 'kcal' },
              { key: 'protein_g', label: 'Protein', unit: 'g' },
              { key: 'carbs_g', label: 'Carbs', unit: 'g' },
              { key: 'fat_g', label: 'Fat', unit: 'g' },
            ].map(({ key, label, unit }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 block mb-1">{label} ({unit})</label>
                <input
                  type="number"
                  min="0"
                  value={defaultMacros[key as keyof DayMacros]}
                  onChange={e => setDefaultMacros(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Per-day toggle */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Set different macros per day</p>
              <p className="text-xs text-gray-400 mt-0.5">Great for carb cycling or training/rest days</p>
            </div>
            <button
              onClick={() => setUsePerDay(p => !p)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${usePerDay ? 'bg-green-500' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${usePerDay ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Per-day macros */}
        {usePerDay && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 tracking-wide uppercase">Day-by-day targets</p>
              <button
                onClick={copyDefaultToAll}
                className="text-xs text-green-600 font-medium hover:underline"
              >
                Copy defaults to all days
              </button>
            </div>

            {DAYS.map(day => {
              const isToday = day === todayName
              return (
                <div key={day} className={`bg-white rounded-2xl border shadow-sm p-4 ${isToday ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{day}</h3>
                    {isToday && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Today</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'calories', label: 'Calories', placeholder: defaultMacros.calories },
                      { key: 'protein_g', label: 'Protein (g)', placeholder: defaultMacros.protein_g },
                      { key: 'carbs_g', label: 'Carbs (g)', placeholder: defaultMacros.carbs_g },
                      { key: 'fat_g', label: 'Fat (g)', placeholder: defaultMacros.fat_g },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs text-gray-400 block mb-1">{label}</label>
                        <input
                          type="number"
                          min="0"
                          value={weekly[day]?.[key as keyof DayMacros] || ''}
                          onChange={e => updateDay(day, key as keyof DayMacros, e.target.value)}
                          placeholder={placeholder}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full font-semibold py-3.5 rounded-xl transition-colors text-sm ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300'
          }`}
        >
          {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Macro Targets'}
        </button>
      </div>
    </div>
  )
}
