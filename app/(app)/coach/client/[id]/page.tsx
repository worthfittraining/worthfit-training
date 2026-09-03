'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
const MEAL_ICONS: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎', dessert: '🍰' }
const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', dessert: 'Dessert' }

type FoodItem = {
  id: string
  food_name: string
  meal_slot: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  notes: string
}

type DayData = {
  date: string
  cal: number; pro: number; carb: number; fat: number; fib: number
  items: FoodItem[]
}

type ClientData = {
  id: string
  name: string
  email: string
  goal: string
  program_week: number
  targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
  stats: {
    height_in: number | null
    weight_lbs: number | null
    age: number | null
    sex: string
    activity_level: string
  }
}

// Within-target check — colored pill logic
function hitCal(v: number, t: number) { return t > 0 && Math.abs(v - t) <= 100 }
function hitMacro(v: number, t: number, tol = 5) { return t > 0 && Math.abs(v - t) <= tol }

function MacroPill({ value, target, type, unit = 'g' }: { value: number; target: number; type: 'cal' | 'pro' | 'carb' | 'fat' | 'fib'; unit?: string }) {
  const noLog = value === 0 && target > 0
  const hit = type === 'cal' ? hitCal(value, target) : hitMacro(value, target, type === 'carb' ? 10 : 5)
  const colors: Record<string, string> = {
    cal: 'bg-[#0e7490] text-[#cffafe]',
    pro: 'bg-[#15803d] text-[#dcfce7]',
    carb: 'bg-[#c2410c] text-[#ffedd5]',
    fat: 'bg-[#7c3aed] text-[#ede9fe]',
    fib: 'bg-[#0369a1] text-[#e0f2fe]',
  }
  const display = unit === 'g' ? `${value}g` : value.toLocaleString()
  if (noLog) return <span className="text-xs text-gray-400">—</span>
  if (hit) return (
    <span className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium min-w-[46px] ${colors[type]}`}>
      {display}
    </span>
  )
  return <span className="text-xs text-gray-500">{display}</span>
}

function MacroCard({ actual, target, label, type }: { actual: number; target: number; label: string; type: 'cal' | 'pro' | 'carb' | 'fat' | 'fib' }) {
  const hit = type === 'cal' ? hitCal(actual, target) : hitMacro(actual, target, type === 'carb' ? 10 : 5)
  const colorMap: Record<string, { bg: string; text: string }> = {
    cal: { bg: 'bg-[#0e7490]', text: 'text-[#cffafe]' },
    pro: { bg: 'bg-[#15803d]', text: 'text-[#dcfce7]' },
    carb: { bg: 'bg-[#c2410c]', text: 'text-[#ffedd5]' },
    fat: { bg: 'bg-[#7c3aed]', text: 'text-[#ede9fe]' },
    fib: { bg: 'bg-[#0369a1]', text: 'text-[#e0f2fe]' },
  }
  const { bg, text } = colorMap[type]
  const fmtActual = type === 'cal' ? actual.toLocaleString() : `${actual}g`
  const fmtTarget = type === 'cal' ? target.toLocaleString() : `${target}g`
  return (
    <div className={`rounded-lg border border-gray-100 p-2 text-center ${hit ? `${bg} border-transparent` : 'bg-white'}`}>
      <div className={`text-sm font-medium ${hit ? text : 'text-gray-800'}`}>{fmtActual}</div>
      <div className={`text-[10px] mt-0.5 ${hit ? text : 'text-gray-400'}`}>/ {fmtTarget}</div>
      <div className={`text-[10px] mt-0.5 ${hit ? text : 'text-gray-400'}`}>{label}</div>
    </div>
  )
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
}

export default function CoachClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string

  const [client, setClient] = useState<ClientData | null>(null)
  const [days, setDays] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null)
  const [activeTab, setActiveTab] = useState<'log' | 'weekly' | 'report'>('log')
  const [reportDays, setReportDays] = useState<30 | 60 | 90>(30)
  const [reportData, setReportData] = useState<DayData[] | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [editingMacros, setEditingMacros] = useState(false)
  const [macroForm, setMacroForm] = useState({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })
  const [savingMacros, setSavingMacros] = useState(false)
  const [macroSaveError, setMacroSaveError] = useState('')

  useEffect(() => {
    fetch(`/api/coach/client/${clientId}`)
      .then(r => {
        if (r.status === 403) { setForbidden(true); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        setClient(d.client)
        setDays(d.days)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (forbidden || !client) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <p className="text-gray-500 text-sm mb-4">You don&apos;t have access to this client.</p>
        <button onClick={() => router.push('/coach')} className="bg-green-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">
          Back to Dashboard
        </button>
      </div>
    )
  }

  const t = client.targets

  // 7-day averages (only days with some logging)
  const loggedDays = days.slice(0, 7).filter(d => d.cal > 0)
  const avg = loggedDays.length === 0 ? null : {
    cal: Math.round(loggedDays.reduce((s, d) => s + d.cal, 0) / loggedDays.length),
    pro: Math.round(loggedDays.reduce((s, d) => s + d.pro, 0) / loggedDays.length),
    carb: Math.round(loggedDays.reduce((s, d) => s + d.carb, 0) / loggedDays.length),
    fat: Math.round(loggedDays.reduce((s, d) => s + d.fat, 0) / loggedDays.length),
    fib: Math.round(loggedDays.reduce((s, d) => s + d.fib, 0) / loggedDays.length),
  }

  async function fetchReport(n: 30 | 60 | 90) {
    setReportLoading(true)
    try {
      const res = await fetch(`/api/coach/client/${clientId}?days=${n}`)
      const d = await res.json()
      setReportData(d.days || [])
    } catch (e) { console.error(e) }
    finally { setReportLoading(false) }
  }

  async function saveMacros() {
    if (!client) return
    setSavingMacros(true)
    setMacroSaveError('')
    try {
      const res = await fetch(`/api/coach/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(macroForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setMacroSaveError(data.error || 'Failed to save')
        return
      }
      setClient(prev => prev ? { ...prev, targets: data.targets } : prev)
      setEditingMacros(false)
    } catch (err) {
      setMacroSaveError('Network error')
    } finally {
      setSavingMacros(false)
    }
  }

  // ── Day Detail View ──
  if (selectedDay) {
    const day = selectedDay
    const mealGroups: Record<string, FoodItem[]> = {}
    for (const item of day.items) {
      if (!mealGroups[item.meal_slot]) mealGroups[item.meal_slot] = []
      mealGroups[item.meal_slot].push(item)
    }
    const mealKeys = MEAL_ORDER.filter(m => mealGroups[m]?.length > 0)

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setSelectedDay(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">←</button>
          <div className="flex-1">
            <div className="text-base font-medium text-gray-800">{formatDate(day.date)}</div>
            <div className="text-xs text-gray-500">{client.name}</div>
          </div>
        </div>

        {/* Day macro summary */}
        <div className="grid grid-cols-5 gap-1.5 px-4 py-3">
          <MacroCard actual={day.cal} target={t.calories} label="cal" type="cal" />
          <MacroCard actual={day.pro} target={t.protein_g} label="protein" type="pro" />
          <MacroCard actual={day.carb} target={t.carbs_g} label="carbs" type="carb" />
          <MacroCard actual={day.fat} target={t.fat_g} label="fat" type="fat" />
          <MacroCard actual={day.fib} target={t.fiber_g} label="fiber" type="fib" />
        </div>

        {/* Target reference */}
        <div className="mx-4 mb-3 bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-400">
          Target: {t.calories.toLocaleString()} cal · {t.protein_g}g protein · {t.carbs_g}g carbs · {t.fat_g}g fat · {t.fiber_g > 0 ? `${t.fiber_g}g fiber` : 'fiber not set'}
        </div>

        {day.items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">Nothing logged this day.</div>
        ) : (
          mealKeys.map(meal => {
            const items = mealGroups[meal]
            const totals = items.reduce((s, i) => ({
              cal: s.cal + i.calories, pro: s.pro + i.protein_g,
              carb: s.carb + i.carbs_g, fat: s.fat + i.fat_g, fib: s.fib + i.fiber_g,
            }), { cal: 0, pro: 0, carb: 0, fat: 0, fib: 0 })
            return (
              <div key={meal} className="mx-4 mb-3">
                {/* Meal header */}
                <div className="grid grid-cols-[1fr_40px_36px_36px_36px_36px] gap-1 bg-gray-100 rounded-t-xl px-3 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  <span>{MEAL_ICONS[meal]} {MEAL_LABELS[meal]}</span>
                  <span className="text-center">Cal</span>
                  <span className="text-center">Pro</span>
                  <span className="text-center">Carb</span>
                  <span className="text-center">Fat</span>
                  <span className="text-center">Fib</span>
                </div>
                {/* Food rows */}
                {items.map((item, i) => (
                  <div key={item.id} className={`grid grid-cols-[1fr_40px_36px_36px_36px_36px] gap-1 px-3 py-2.5 bg-white border-x border-b border-gray-100 items-center ${i === items.length - 1 && 'rounded-b-none'}`}>
                    <div>
                      <div className="text-xs font-medium text-gray-800 leading-tight">{item.food_name}</div>
                      {item.notes && <div className="text-[10px] text-gray-400 mt-0.5">{item.notes}</div>}
                    </div>
                    <div className="text-center text-xs text-gray-600">{item.calories}</div>
                    <div className="text-center text-xs font-medium text-[#15803d]">{item.protein_g}g</div>
                    <div className="text-center text-xs font-medium text-[#c2410c]">{item.carbs_g}g</div>
                    <div className="text-center text-xs font-medium text-[#7c3aed]">{item.fat_g}g</div>
                    <div className="text-center text-xs font-medium text-[#0369a1]">{item.fiber_g}g</div>
                  </div>
                ))}
                {/* Meal total */}
                <div className="grid grid-cols-[1fr_40px_36px_36px_36px_36px] gap-1 px-3 py-2 bg-gray-50 border border-t-0 border-gray-200 rounded-b-xl text-xs font-medium">
                  <span className="text-gray-400 text-[10px]">Total</span>
                  <span className="text-center text-gray-700">{Math.round(totals.cal)}</span>
                  <span className="text-center text-[#15803d]">{Math.round(totals.pro)}g</span>
                  <span className="text-center text-[#c2410c]">{Math.round(totals.carb)}g</span>
                  <span className="text-center text-[#7c3aed]">{Math.round(totals.fat)}g</span>
                  <span className="text-center text-[#0369a1]">{Math.round(totals.fib)}g</span>
                </div>
              </div>
            )
          })
        )}
        <div className="h-8" />
      </div>
    )
  }

  // ── Week Overview ──
  const initials = client.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  // Build a 7-day window for the weekly tab (last 7 calendar days)
  const weekDays = days.slice(0, 7)
  const daysLogged = weekDays.filter(d => d.cal > 0).length

  function calColor(cal: number, target: number) {
    if (cal === 0) return 'bg-gray-200'
    const pct = target > 0 ? (cal / target) * 100 : 0
    if (pct >= 80) return 'bg-green-500'
    if (pct >= 50) return 'bg-yellow-400'
    return 'bg-red-400'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Edit Macros Modal */}
      {editingMacros && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setEditingMacros(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl px-5 py-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-800">Edit Macros</h2>
              <button onClick={() => setEditingMacros(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {([
                { key: 'calories', label: 'Calories', unit: 'kcal', color: 'text-[#0e7490]' },
                { key: 'protein_g', label: 'Protein', unit: 'g', color: 'text-[#15803d]' },
                { key: 'carbs_g', label: 'Carbs', unit: 'g', color: 'text-[#c2410c]' },
                { key: 'fat_g', label: 'Fat', unit: 'g', color: 'text-[#7c3aed]' },
                { key: 'fiber_g', label: 'Fiber', unit: 'g', color: 'text-[#0369a1]' },
              ] as const).map(({ key, label, unit, color }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className={`text-sm font-medium w-16 ${color}`}>{label}</label>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={macroForm[key]}
                      onChange={e => setMacroForm(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-green-400 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
            {macroSaveError && <p className="text-red-500 text-xs mt-3">{macroSaveError}</p>}
            <button
              onClick={saveMacros}
              disabled={savingMacros}
              className="mt-5 w-full bg-green-500 text-white font-semibold py-3 rounded-2xl text-sm disabled:opacity-60"
            >
              {savingMacros ? 'Saving...' : 'Save Macros'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/coach')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">←</button>
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-medium flex-shrink-0">{initials}</div>
        <div className="flex-1">
          <div className="text-base font-medium text-gray-800">{client.name}</div>
          <div className="text-xs text-gray-400">Week {client.program_week} · {String(client.goal).replace(/_/g, ' ')}</div>
        </div>
        <button
          onClick={() => {
            setMacroForm({ ...client.targets })
            setMacroSaveError('')
            setEditingMacros(true)
          }}
          className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl"
        >
          Edit Macros
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-white border-b border-gray-100 px-4">
        <button
          onClick={() => setActiveTab('log')}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'log' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}
        >
          📋 Log
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'weekly' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}
        >
          📊 Weekly
        </button>
        <button
          onClick={() => { setActiveTab('report'); if (!reportData) fetchReport(reportDays) }}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'report' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}
        >
          📈 Report
        </button>
      </div>

      {/* Client Stats Strip */}
      {client.stats && (() => {
        const s = client.stats
        const heightStr = s.height_in
          ? `${Math.floor(s.height_in / 12)}'${s.height_in % 12}"`
          : null
        const activityLabels: Record<string, string> = {
          sedentary: 'Sedentary',
          lightly_active: 'Lightly Active',
          moderately_active: 'Moderately Active',
          very_active: 'Very Active',
          extra_active: 'Extra Active',
        }
        const stats = [
          heightStr && { label: 'Height', value: heightStr },
          s.weight_lbs && { label: 'Weight', value: `${s.weight_lbs} lbs` },
          s.age && { label: 'Age', value: String(s.age) },
          s.sex && { label: 'Sex', value: s.sex.charAt(0).toUpperCase() + s.sex.slice(1) },
          s.activity_level && { label: 'Activity', value: activityLabels[s.activity_level] || s.activity_level },
        ].filter(Boolean) as { label: string; value: string }[]
        if (stats.length === 0) return null
        return (
          <div className="bg-white border-b border-gray-100 px-4 py-3">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Client Stats</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {stats.map(({ label, value }) => (
                <div key={label} className="text-xs">
                  <span className="text-gray-400">{label}: </span>
                  <span className="text-gray-700 font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Log Tab ── */}
      {activeTab === 'log' && (
        <>
          {/* 7-day averages */}
          {avg && (
            <>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">7-day averages</p>
              </div>
              <div className="grid grid-cols-5 gap-1.5 px-4 pb-3">
                <MacroCard actual={avg.cal} target={t.calories} label="cal" type="cal" />
                <MacroCard actual={avg.pro} target={t.protein_g} label="protein" type="pro" />
                <MacroCard actual={avg.carb} target={t.carbs_g} label="carbs" type="carb" />
                <MacroCard actual={avg.fat} target={t.fat_g} label="fat" type="fat" />
                <MacroCard actual={avg.fib} target={t.fiber_g} label="fiber" type="fib" />
              </div>
            </>
          )}

          {/* Daily log table */}
          <div className="px-4 pb-1">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Daily log — tap a row for full breakdown</p>
          </div>

          <div className="mx-4 bg-white border border-gray-100 rounded-2xl overflow-hidden mb-6">
            {/* Column headers */}
            <div className="grid grid-cols-[72px_1fr_1fr_1fr_1fr_1fr] text-[10px] font-medium text-gray-400 uppercase tracking-wide px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span>Date</span>
              <span className="text-center">Cal</span>
              <span className="text-center">Pro</span>
              <span className="text-center">Carb</span>
              <span className="text-center">Fat</span>
              <span className="text-center">Fiber</span>
            </div>
            {/* Goal row */}
            <div className="grid grid-cols-[72px_1fr_1fr_1fr_1fr_1fr] px-3 py-1.5 border-b border-gray-200 bg-gray-50 text-[11px] text-gray-400">
              <span className="font-medium">Goal</span>
              <span className="text-center">{t.calories.toLocaleString()}</span>
              <span className="text-center">{t.protein_g}g</span>
              <span className="text-center">{t.carbs_g}g</span>
              <span className="text-center">{t.fat_g}g</span>
              <span className="text-center">{t.fiber_g > 0 ? `${t.fiber_g}g` : '—'}</span>
            </div>
            {/* Day rows */}
            {days.slice(0, 14).map((day, i) => (
              <div
                key={day.date}
                onClick={() => setSelectedDay(day)}
                className={`grid grid-cols-[72px_1fr_1fr_1fr_1fr_1fr] px-3 py-2.5 items-center cursor-pointer hover:bg-gray-50 transition-colors ${i < days.slice(0, 14).length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <span className="text-xs font-medium text-gray-700">{formatDate(day.date).replace(',', '')}</span>
                <span className="text-center"><MacroPill value={day.cal} target={t.calories} type="cal" unit="kcal" /></span>
                <span className="text-center"><MacroPill value={day.pro} target={t.protein_g} type="pro" /></span>
                <span className="text-center"><MacroPill value={day.carb} target={t.carbs_g} type="carb" /></span>
                <span className="text-center"><MacroPill value={day.fat} target={t.fat_g} type="fat" /></span>
                <span className="text-center"><MacroPill value={day.fib} target={t.fiber_g} type="fib" /></span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Report Tab ── */}
      {activeTab === 'report' && (
        <div className="px-4 pt-4 pb-6 space-y-4">
          {/* Days selector */}
          <div className="flex gap-2">
            {([30, 60, 90] as const).map(n => (
              <button
                key={n}
                onClick={() => { setReportDays(n); setReportData(null); fetchReport(n) }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${reportDays === n ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                {n} days
              </button>
            ))}
          </div>

          {reportLoading ? (
            <div className="text-center text-gray-400 py-12 text-sm">Loading report...</div>
          ) : reportData ? (() => {
            const allDays = reportData
            const logged = allDays.filter(d => d.cal > 0)
            const total = allDays.length
            const loggedCount = logged.length
            const hitProtein = logged.filter(d => t.protein_g > 0 && d.pro >= t.protein_g * 0.9).length
            const hitCalories = logged.filter(d => t.calories > 0 && d.cal >= t.calories * 0.9 && d.cal <= t.calories * 1.1).length
            const hitFiber = logged.filter(d => t.fiber_g > 0 && d.fib >= t.fiber_g * 0.9).length
            const avgCal = logged.length ? Math.round(logged.reduce((s, d) => s + d.cal, 0) / logged.length) : 0
            const avgPro = logged.length ? Math.round(logged.reduce((s, d) => s + d.pro, 0) / logged.length) : 0
            const avgFib = logged.length ? Math.round(logged.reduce((s, d) => s + d.fib, 0) / logged.length) : 0

            function StatRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">{label}</span>
                    <span className={`font-semibold ${color}`}>{count}/{total} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all`} style={{ width: `${pct}%`, backgroundColor: color.includes('green') ? '#22c55e' : color.includes('blue') ? '#3b82f6' : color.includes('orange') ? '#f97316' : color.includes('purple') ? '#a855f7' : '#6b7280' }} />
                  </div>
                </div>
              )
            }

            return (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-4">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Goal Hit Rate — last {reportDays} days</p>
                  <StatRow label="Days logged" count={loggedCount} total={total} color="text-gray-700" />
                  <StatRow label="Hit protein goal (±10%)" count={hitProtein} total={total} color="text-green-600" />
                  <StatRow label="On calorie target (±10%)" count={hitCalories} total={total} color="text-orange-500" />
                  {t.fiber_g > 0 && <StatRow label="Hit fiber goal (±10%)" count={hitFiber} total={total} color="text-purple-500" />}
                </div>

                {logged.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-3">Avg Daily (logged days only)</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Calories</span>
                        <span className="font-semibold text-gray-800">{avgCal.toLocaleString()} <span className="text-gray-400 font-normal text-xs">/ {t.calories.toLocaleString()}</span></span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Protein</span>
                        <span className="font-semibold text-[#15803d]">{avgPro}g <span className="text-gray-400 font-normal text-xs">/ {t.protein_g}g</span></span>
                      </div>
                      {t.fiber_g > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Fiber</span>
                          <span className="font-semibold text-[#0369a1]">{avgFib}g <span className="text-gray-400 font-normal text-xs">/ {t.fiber_g}g</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )
          })() : null}
        </div>
      )}

      {/* ── Weekly Tab ── */}
      {activeTab === 'weekly' && (
        <div className="px-4 pt-4 pb-6 space-y-4">

          {/* Summary stats */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-3">This Week</p>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-800">{daysLogged}<span className="text-base font-medium text-gray-400"> / 7</span></div>
                <div className="text-xs text-gray-500 mt-0.5">Days Logged</div>
              </div>
              <div className="flex-1 h-px bg-gray-100" />
              <div className="text-xs text-gray-500 text-right">
                {daysLogged === 0 ? 'No data this week' : `${Math.round((daysLogged / 7) * 100)}% consistency`}
              </div>
            </div>
          </div>

          {/* Average macros vs targets */}
          {avg ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-3">Avg Daily Macros vs Target</p>
              <div className="grid grid-cols-5 gap-1.5">
                <MacroCard actual={avg.cal} target={t.calories} label="cal" type="cal" />
                <MacroCard actual={avg.pro} target={t.protein_g} label="protein" type="pro" />
                <MacroCard actual={avg.carb} target={t.carbs_g} label="carbs" type="carb" />
                <MacroCard actual={avg.fat} target={t.fat_g} label="fat" type="fat" />
                <MacroCard actual={avg.fib} target={t.fiber_g} label="fiber" type="fib" />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center text-gray-400 text-sm">
              No logs this week to average.
            </div>
          )}

          {/* Day-by-day calorie progress bars */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-3">Daily Calorie Progress</p>
            <div className="space-y-3">
              {weekDays.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No data available.</p>
              ) : (
                weekDays.map(day => {
                  const pct = t.calories > 0 ? Math.min((day.cal / t.calories) * 100, 100) : 0
                  const barColor = calColor(day.cal, t.calories)
                  return (
                    <div key={day.date}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{formatDate(day.date)}</span>
                        <span className="text-gray-500">
                          {day.cal > 0 ? `${day.cal.toLocaleString()} / ${t.calories.toLocaleString()} cal` : 'Not logged'}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {/* Legend */}
            <div className="flex gap-3 mt-4 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> ≥80%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 50–79%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> &lt;50%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> No log</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
