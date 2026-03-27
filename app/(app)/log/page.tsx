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

export default function LogPage() {
  const { user } = useUser()
  const [view, setView] = useState<'today' | 'week'>('today')
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [weekLogs, setWeekLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [weekLoading, setWeekLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ Calories?: number; Protein_g?: number; Carbs_g?: number; Fat_g?: number } | null>(null)

  useEffect(() => {
    if (user) { fetchLogs(); fetchProfile() }
  }, [user])

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

  async function fetchLogs() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    try {
      const res = await fetch(`/api/log?email=${encodeURIComponent(email)}`)
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
      const res = await fetch(`/api/log?email=${encodeURIComponent(email)}&days=7`)
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

  const totalCalories = logs.reduce((s, l) => s + (l.calories || 0), 0)
  const totalProtein = logs.reduce((s, l) => s + (l.protein_g || 0), 0)
  const totalCarbs = logs.reduce((s, l) => s + (l.carbs_g || 0), 0)
  const totalFat = logs.reduce((s, l) => s + (l.fat_g || 0), 0)
  const bySlot = MEAL_ORDER.reduce<Record<string, FoodLog[]>>((acc, slot) => {
    acc[slot] = logs.filter((l) => l.meal_slot === slot)
    return acc
  }, {})

  const calTarget = profile?.Calories || 0
  const protTarget = profile?.Protein_g || 0
  const carbTarget = profile?.Carbs_g || 0
  const fatTarget = profile?.Fat_g || 0

  const weekDays: DaySummary[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = localDateString(d)
    const dayLogs = weekLogs.filter(l => l.date === dateStr)
    return { date: dateStr, label: getDateLabel(dateStr), calories: dayLogs.reduce((s, l) => s + l.calories, 0), protein_g: dayLogs.reduce((s, l) => s + l.protein_g, 0), carbs_g: dayLogs.reduce((s, l) => s + l.carbs_g, 0), fat_g: dayLogs.reduce((s, l) => s + l.fat_g, 0), logged: dayLogs.length > 0 }
  })

  const daysHitProtein = weekDays.filter(d => d.logged && protTarget && d.protein_g >= protTarget * 0.9).length
  const daysHitCalories = weekDays.filter(d => d.logged && calTarget && d.calories >= calTarget * 0.9 && d.calories <= calTarget * 1.1).length
  const loggedDays = weekDays.filter(d => d.logged).length
  const today = localDateString()

  return (
    <div className="min-h-screen bg-gray-50 p-4">
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
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Link href="/log/photo" className="bg-white border-2 border-green-400 text-green-600 py-4 rounded-xl font-semibold text-center hover:bg-green-50 transition text-sm">📷<br />Photo</Link>
              <Link href="/log/barcode" className="bg-white border-2 border-indigo-400 text-indigo-600 py-4 rounded-xl font-semibold text-center hover:bg-indigo-50 transition text-sm">🔍<br />Barcode</Link>
              <Link href="/log/recipe" className="bg-white border-2 border-orange-400 text-orange-600 py-4 rounded-xl font-semibold text-center hover:bg-orange-50 transition text-sm">🍳<br />Recipe</Link>
              <Link href="/log/new" className="bg-white border-2 border-blue-400 text-blue-600 py-4 rounded-xl font-semibold text-center hover:bg-blue-50 transition text-sm">✏️<br />Manual</Link>
              <Link href="/chat" className="bg-white border-2 border-purple-400 text-purple-600 py-4 rounded-xl font-semibold text-center hover:bg-purple-50 transition text-sm col-span-2">💬 Ask Nali</Link>
            </div>

            <div className="bg-white rounded-2xl shadow p-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Today&apos;s Totals</h2>
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
                <p className="text-gray-500">Nothing logged yet today.</p>
                <p className="text-sm text-gray-400 mt-1">Use the buttons above to log your meals.</p>
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
                      <div className="col-span-1"><p className="text-sm font-semibold text-gray-700">{day.label}</p></div>
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
                              <div className="flex-1 min-w-0">
                                <span className="font-medium capitalize text-gray-400 mr-1">{log.meal_slot}:</span>
                                <span className="text-gray-700 truncate">{log.food_name}</span>
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
