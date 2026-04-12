'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'

type FoodLog = {
  id: string
  food_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  meal_slot: string
  notes?: string
  date: string
}

type DaySummary = {
  date: string
  label: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  logged: boolean
}

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

/** Returns local date string YYYY-MM-DD (not UTC — avoids off-by-one for US users at night) */
function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDateLabel(dateStr: string): string {
  const today = localDateString()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = localDateString(yesterday)
  if (dateStr === today) return 'Today'
  if (dateStr === yStr) return 'Yesterday'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function HitBadge({ value, target, label }: { value: number; target: number; label: string }) {
  if (!target) return <div className="text-center"><span className="text-xs text-gray-500">{value}</span><p className="text-xs text-gray-400">{label}</p></div>
  const pct = value / target
  const hit = pct >= 0.9
  const over = pct > 1.1
  return (
    <div className="text-center">
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${over ? 'bg-purple-100 text-purple-700' : hit ? 'bg-green-100 text-green-700' : 'text-gray-500'}`}>{value}</span>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

type EditDraft = {
  id: string
  food_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  meal_slot: string
}

function EditModal({ draft, onSave, onClose, saving }: {
  draft: EditDraft
  onSave: (updated: EditDraft) => void
  onClose: () => void
  saving: boolean
}) {
  const [local, setLocal] = useState(draft)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white w-full max-w-md rounded-3xl p-5 pb-6 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-base font-bold text-gray-800 mb-4">Edit Entry</h2>

        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 block mb-1">Food name</label>
          <input
            type="text"
            value={local.food_name}
            onChange={e => setLocal(p => ({ ...p, food_name: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 block mb-1">Meal</label>
          <select
            value={local.meal_slot}
            onChange={e => setLocal(p => ({ ...p, meal_slot: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            {MEAL_SLOTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
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
                value={local[key]}
                onChange={e => setLocal(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:border-gray-300 transition">
            Cancel
          </button>
          <button onClick={() => onSave(local)} disabled={saving} className="flex-1 py-3 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LogPage() {
  const { user } = useUser()
  const [view, setView] = useState<'today' | 'week'>('today')
  const [selectedDate, setSelectedDate] = useState(localDateString())
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [weekLogs, setWeekLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [weekLoading, setWeekLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [profile, setProfile] = useState<{
    Calories?: number; Protein_g?: number; Carbs_g?: number; Fat_g?: number
    Rest_Calories?: number; Rest_Protein_g?: number; Rest_Carbs_g?: number; Rest_Fat_g?: number
  } | null>(null)
  const REST_DAY_KEY = `rest_day_${localDateString()}`
  const [isRestDay, setIsRestDay] = useState(() => {
    try { return localStorage.getItem(`rest_day_${localDateString()}`) === 'true' } catch { return false }
  })
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (user) { fetchLogs(selectedDate); fetchProfile() }
  }, [user])

  // Re-fetch logs whenever the selected date changes (skip initial mount — user effect handles that)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!mounted) { setMounted(true); return }
    if (user) fetchLogs(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    if (view === 'week' && weekLogs.length === 0 && user) fetchWeekLogs()
  }, [view, user])

  async function fetchProfile() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    try {
      const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      if (res.ok) setProfile(await res.json())
    } catch { /* ignore */ }
  }

  async function fetchLogs(date?: string) {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    setLoading(true)
    try {
      const fetchDate = date ?? selectedDate
      const res = await fetch(`/api/log?email=${encodeURIComponent(email)}&date=${fetchDate}`)
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function fetchWeekLogs() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    setWeekLoading(true)
    try {
      // Pass local date as anchor so server generates correct 7-day range regardless of UTC offset
      const res = await fetch(`/api/log?email=${encodeURIComponent(email)}&date=${localDateString()}&days=7`)
      const data = await res.json()
      setWeekLogs(data.logs || [])
    } catch (e) { console.error(e) }
    finally { setWeekLoading(false) }
  }

  async function deleteLog(id: string) {
    if (!confirm('Remove this entry?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/log?id=${id}`, { method: 'DELETE' })
      if (res.ok) setLogs(prev => prev.filter(l => l.id !== id))
    } catch (e) { console.error(e) }
    finally { setDeleting(null) }
  }

  async function copyToToday(log: FoodLog) {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    setCopying(log.id)
    try {
      // Use local date — avoids off-by-one for US users logging after ~7 PM
      const today = localDateString()
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, food_name: log.food_name, calories: log.calories, protein_g: log.protein_g, carbs_g: log.carbs_g, fat_g: log.fat_g, fiber_g: log.fiber_g || 0, meal_slot: log.meal_slot, notes: log.notes || '', date: today }),
      })
      if (res.ok) {
        const data = await res.json()
        const newEntry: FoodLog = { ...log, id: data.id, date: today }
        setCopySuccess(log.id)
        setTimeout(() => setCopySuccess(null), 2500)
        // Update both today's view AND the week view so the item appears correctly everywhere
        setLogs(prev => [...prev, newEntry])
        setWeekLogs(prev => [...prev, newEntry])
      }
    } catch (e) { console.error(e) }
    finally { setCopying(null) }
  }

  async function saveEdit(updated: EditDraft) {
    setEditSaving(true)
    try {
      const res = await fetch('/api/log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      if (res.ok) {
        setLogs(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
        setWeekLogs(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
        setEditDraft(null)
      }
    } catch (e) { console.error(e) }
    finally { setEditSaving(false) }
  }

  const today = localDateString()
  const isViewingToday = selectedDate === today

  function goToPrevDay() {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    setSelectedDate(localDateString(d))
  }

  function goToNextDay() {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    const next = localDateString(d)
    if (next <= today) setSelectedDate(next)
  }

  const totalCalories = logs.reduce((s, l) => s + (l.calories || 0), 0)
  const totalProtein = logs.reduce((s, l) => s + (l.protein_g || 0), 0)
  const totalCarbs = logs.reduce((s, l) => s + (l.carbs_g || 0), 0)
  const totalFat = logs.reduce((s, l) => s + (l.fat_g || 0), 0)
  const bySlot = MEAL_ORDER.reduce<Record<string, FoodLog[]>>((acc, slot) => {
    acc[slot] = logs.filter((l) => l.meal_slot === slot)
    return acc
  }, {})

  // Use rest-day targets when toggled (fall back to training targets if rest-day not set)
  const hasRestTargets = !!(profile?.Rest_Calories || profile?.Rest_Protein_g)
  const calTarget = (isRestDay && profile?.Rest_Calories) ? profile.Rest_Calories : (profile?.Calories || 0)
  const protTarget = (isRestDay && profile?.Rest_Protein_g) ? profile.Rest_Protein_g : (profile?.Protein_g || 0)
  const carbTarget = (isRestDay && profile?.Rest_Carbs_g) ? profile.Rest_Carbs_g : (profile?.Carbs_g || 0)
  const fatTarget = (isRestDay && profile?.Rest_Fat_g) ? profile.Rest_Fat_g : (profile?.Fat_g || 0)

  const weekDays: DaySummary[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = localDateString(d)
    const dayLogs = weekLogs.filter(l => l.date === dateStr)
    return { date: dateStr, label: getDateLabel(dateStr), calories: dayLogs.reduce((s, l) => s + l.calories, 0), protein_g: dayLogs.reduce((s, l) => s + l.protein_g, 0), carbs_g: dayLogs.reduce((s, l) => s + l.carbs_g, 0), fat_g: dayLogs.reduce((s, l) => s + l.fat_g, 0), logged: dayLogs.length > 0 }
  })

  const daysHitProtein = weekDays.filter(d => d.logged && protTarget && d.protein_g >= protTarget * 0.9).length
  const daysHitCalories = weekDays.filter(d => d.logged && calTarget && d.calories >= calTarget * 0.9 && d.calories <= calTarget * 1.1).length
  const loggedDays = weekDays.filter(d => d.logged).length

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {editDraft && (
        <EditModal
          draft={editDraft}
          onSave={saveEdit}
          onClose={() => setEditDraft(null)}
          saving={editSaving}
        />
      )}
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">Food Log</h1>
          <Link href="/dashboard" className="text-sm text-green-600 hover:underline">← Dashboard</Link>
        </div>

        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-5">
          <button onClick={() => setView('today')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${view === 'today' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>Today</button>
          <button onClick={() => setView('week')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${view === 'week' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>📊 This Week</button>
        </div>

        {view === 'today' && (
          <>
            {/* Date navigation */}
            <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
              <button onClick={goToPrevDay} className="text-gray-400 hover:text-gray-700 text-xl font-bold w-8 flex items-center justify-center transition-colors">‹</button>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">{getDateLabel(selectedDate)}</p>
                {!isViewingToday && <p className="text-xs text-gray-400">{selectedDate}</p>}
              </div>
              <button
                onClick={goToNextDay}
                disabled={isViewingToday}
                className={`text-xl font-bold w-8 flex items-center justify-center transition-colors ${isViewingToday ? 'text-gray-200 cursor-default' : 'text-gray-400 hover:text-gray-700'}`}
              >›</button>
            </div>

            {/* Add food buttons — only show when viewing today */}
            {isViewingToday ? (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <Link href="/log/photo" className="bg-white border-2 border-green-400 text-green-600 py-4 rounded-xl font-semibold text-center hover:bg-green-50 transition text-sm">📷<br />Photo</Link>
                <Link href="/log/barcode" className="bg-white border-2 border-indigo-400 text-indigo-600 py-4 rounded-xl font-semibold text-center hover:bg-indigo-50 transition text-sm">🔍<br />Barcode</Link>
                <Link href="/log/recipe" className="bg-white border-2 border-orange-400 text-orange-600 py-4 rounded-xl font-semibold text-center hover:bg-orange-50 transition text-sm">🍳<br />Recipe</Link>
                <Link href="/log/new" className="bg-white border-2 border-blue-400 text-blue-600 py-4 rounded-xl font-semibold text-center hover:bg-blue-50 transition text-sm">✏️<br />Manual</Link>
                <Link href="/chat" className="bg-white border-2 border-purple-400 text-purple-600 py-4 rounded-xl font-semibold text-center hover:bg-purple-50 transition text-sm col-span-2">💬 Ask Nali</Link>
              </div>
            ) : (
              <div className="text-center mb-4">
                <button onClick={() => setSelectedDate(today)} className="text-sm text-green-600 hover:underline">← Back to today to add new entries</button>
              </div>
            )}

            {/* Rest day toggle — only shown if rest-day targets are configured */}
            {hasRestTargets && (
              <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5 mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Rest Day</p>
                  <p className="text-xs text-gray-400">Switch to rest-day macro targets</p>
                </div>
                <button
                  onClick={() => setIsRestDay(r => {
                    const next = !r
                    try { localStorage.setItem(REST_DAY_KEY, String(next)) } catch {}
                    return next
                  })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isRestDay ? 'bg-blue-500' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isRestDay ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow p-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {isRestDay ? '😴 Rest Day Totals' : isViewingToday ? "Today's Totals" : `${getDateLabel(selectedDate)} Totals`}
              </h2>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><p className={`text-xl font-bold ${calTarget && totalCalories > calTarget * 1.1 ? 'text-purple-500' : calTarget && totalCalories >= calTarget * 0.9 ? 'text-green-500' : 'text-orange-500'}`}>{totalCalories}</p><p className="text-xs text-gray-400">{calTarget ? `/ ${calTarget}` : ''} kcal</p></div>
                <div><p className={`text-xl font-bold ${protTarget && totalProtein >= protTarget * 0.9 ? 'text-green-500' : 'text-blue-500'}`}>{totalProtein}g</p><p className="text-xs text-gray-400">{protTarget ? `/ ${protTarget}g` : ''} prot</p></div>
                <div><p className="text-xl font-bold text-yellow-500">{totalCarbs}g</p><p className="text-xs text-gray-400">{carbTarget ? `/ ${carbTarget}g` : ''} carbs</p></div>
                <div><p className="text-xl font-bold text-green-500">{totalFat}g</p><p className="text-xs text-gray-400">{fatTarget ? `/ ${fatTarget}g` : ''} fat</p></div>
              </div>
            </div>

            {loading && <div className="text-center text-gray-400 py-12">Loading your log...</div>}
            {!loading && logs.length === 0 && (
              <div className="bg-white rounded-2xl shadow p-8 text-center">
                <p className="text-4xl mb-3">🍽️</p>
                <p className="text-gray-500">{isViewingToday ? 'Nothing logged yet today.' : `Nothing logged on ${getDateLabel(selectedDate)}.`}</p>
                <p className="text-sm text-gray-400 mt-1">{isViewingToday ? 'Use the buttons above to log your meals.' : 'Use the arrows to navigate to another day.'}</p>
              </div>
            )}
            {!loading && MEAL_ORDER.map((slot) => {
              const slotLogs = bySlot[slot]
              if (slotLogs.length === 0) return null
              const slotCal = slotLogs.reduce((s, l) => s + (l.calories || 0), 0)
              return (
                <div key={slot} className="bg-white rounded-2xl shadow mb-4 overflow-hidden">
                  <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b">
                    <h3 className="font-semibold text-gray-700 capitalize">{slot}</h3>
                    <span className="text-sm text-gray-500">{slotCal} kcal</span>
                  </div>
                  <div className="divide-y">
                    {slotLogs.map((log) => (
                      <div key={log.id} className="px-4 py-3 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <p className="font-medium text-gray-800 text-sm truncate pr-2">{log.food_name}</p>
                            <p className="text-sm font-bold text-orange-500 shrink-0">{log.calories} kcal</p>
                          </div>
                          <div className="flex gap-3 mt-1 text-xs text-gray-500">
                            <span>P: {log.protein_g}g</span><span>C: {log.carbs_g}g</span><span>F: {log.fat_g}g</span>
                          </div>
                          {log.notes && <p className="text-xs text-gray-400 mt-1 italic">{log.notes}</p>}
                        </div>
                        {!isViewingToday && (
                          <button
                            onClick={() => copyToToday(log)}
                            disabled={copying === log.id}
                            title="Copy to today"
                            className={`text-xs font-semibold shrink-0 mt-0.5 px-1.5 py-1 rounded-lg transition-colors ${copySuccess === log.id ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                          >
                            {copying === log.id ? '...' : copySuccess === log.id ? '✓' : '+ today'}
                          </button>
                        )}
                        <button
                          onClick={() => setEditDraft({ id: log.id, food_name: log.food_name, calories: log.calories, protein_g: log.protein_g, carbs_g: log.carbs_g, fat_g: log.fat_g, meal_slot: log.meal_slot })}
                          className="text-gray-300 hover:text-blue-400 transition-colors text-sm shrink-0 mt-0.5 px-1"
                          title="Edit"
                        >✏️</button>
                        <button onClick={() => deleteLog(log.id)} disabled={deleting === log.id} className="text-gray-300 hover:text-red-400 transition-colors text-lg shrink-0 mt-0.5" title="Remove">
                          {deleting === log.id ? '...' : '×'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {view === 'week' && (
          <>
            {loggedDays > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100"><p className="text-2xl font-bold text-green-500">{loggedDays}/7</p><p className="text-xs text-gray-400">days logged</p></div>
                <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100"><p className="text-2xl font-bold text-blue-500">{daysHitProtein}/7</p><p className="text-xs text-gray-400">hit protein</p></div>
                <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100"><p className="text-2xl font-bold text-orange-500">{daysHitCalories}/7</p><p className="text-xs text-gray-400">on calories</p></div>
              </div>
            )}
            {weekLoading ? (
              <div className="text-center text-gray-400 py-12">Loading this week...</div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-5 px-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <span className="col-span-1">Day</span>
                  <span className="text-center">Kcal</span>
                  <span className="text-center">Prot</span>
                  <span className="text-center">Carbs</span>
                  <span className="text-center">Fat</span>
                </div>
                {weekDays.map(day => (
                  <div key={day.date} className={`bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 ${!day.logged ? 'opacity-50' : ''}`}>
                    <div className="grid grid-cols-5 items-center">
                      <div className="col-span-1">
                        <button
                          onClick={() => { setSelectedDate(day.date); setView('today') }}
                          className="text-left"
                        >
                          <p className="text-sm font-semibold text-green-600 hover:underline">{day.label}</p>
                        </button>
                      </div>
                      {day.logged ? (
                        <>
                          <HitBadge value={day.calories} target={calTarget} label="kcal" />
                          <HitBadge value={day.protein_g} target={protTarget} label="prot" />
                          <HitBadge value={day.carbs_g} target={carbTarget} label="carbs" />
                          <HitBadge value={day.fat_g} target={fatTarget} label="fat" />
                        </>
                      ) : (
                        <span className="col-span-4 text-xs text-gray-300 text-center">No data</span>
                      )}
                    </div>
                    {day.logged && (
                      <details className="mt-2">
                        <summary className="text-xs text-green-600 cursor-pointer select-none">View meals</summary>
                        <div className="mt-2 space-y-1.5">
                          {weekLogs.filter(l => l.date === day.date).map(log => (
                            <div key={log.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <span className="font-medium capitalize text-gray-400 mr-1">{log.meal_slot}:</span>
                                <span className="text-gray-700 inline-block max-w-full truncate align-bottom" style={{maxWidth:'calc(100% - 4rem)'}}>{log.food_name}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className="text-orange-500 font-semibold">{log.calories} cal</span>
                                {day.date !== today && (
                                  <button
                                    onClick={() => copyToToday(log)}
                                    disabled={copying === log.id}
                                    title="Copy to today"
                                    className={`font-bold text-sm transition-colors ${copySuccess === log.id ? 'text-green-500' : 'text-gray-400 hover:text-green-500'}`}
                                  >
                                    {copying === log.id ? '...' : copySuccess === log.id ? '✓ copied' : '+ copy'}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
