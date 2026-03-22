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

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

export default function LogPage() {
  const { user } = useUser()
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (user) fetchLogs()
  }, [user])

  async function fetchLogs() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    try {
      const res = await fetch(`/api/log?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function deleteLog(id: string) {
    if (!confirm('Remove this entry?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/log?id=${id}`, { method: 'DELETE' })
      if (res.ok) setLogs(prev => prev.filter(l => l.id !== id))
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(null)
    }
  }

  const totalCalories = logs.reduce((s, l) => s + (l.calories || 0), 0)
  const totalProtein = logs.reduce((s, l) => s + (l.protein_g || 0), 0)
  const totalCarbs = logs.reduce((s, l) => s + (l.carbs_g || 0), 0)
  const totalFat = logs.reduce((s, l) => s + (l.fat_g || 0), 0)

  const bySlot = MEAL_ORDER.reduce<Record<string, FoodLog[]>>((acc, slot) => {
    acc[slot] = logs.filter((l) => l.meal_slot === slot)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Today&apos;s Food Log</h1>
          <Link href="/dashboard" className="text-sm text-green-600 hover:underline">
            ← Dashboard
          </Link>
        </div>

        {/* Quick add grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Link href="/log/photo" className="bg-white border-2 border-green-400 text-green-600 py-4 rounded-xl font-semibold text-center hover:bg-green-50 transition text-sm">
            📷<br />Photo
          </Link>
          <Link href="/log/barcode" className="bg-white border-2 border-indigo-400 text-indigo-600 py-4 rounded-xl font-semibold text-center hover:bg-indigo-50 transition text-sm">
            🔍<br />Barcode
          </Link>
          <Link href="/log/recipe" className="bg-white border-2 border-orange-400 text-orange-600 py-4 rounded-xl font-semibold text-center hover:bg-orange-50 transition text-sm">
            🍳<br />Recipe
          </Link>
          <Link href="/log/new" className="bg-white border-2 border-blue-400 text-blue-600 py-4 rounded-xl font-semibold text-center hover:bg-blue-50 transition text-sm">
            ✏️<br />Manual
          </Link>
          <Link href="/chat" className="bg-white border-2 border-purple-400 text-purple-600 py-4 rounded-xl font-semibold text-center hover:bg-purple-50 transition text-sm col-span-2">
            💬 Ask Nali
          </Link>
        </div>

        {/* Daily Totals */}
        <div className="bg-white rounded-2xl shadow p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Today&apos;s Totals
          </h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-orange-500">{totalCalories}</p>
              <p className="text-xs text-gray-500">kcal</p>
            </div>
            <div>
              <p className="text-xl font-bold text-blue-500">{totalProtein}g</p>
              <p className="text-xs text-gray-500">protein</p>
            </div>
            <div>
              <p className="text-xl font-bold text-yellow-500">{totalCarbs}g</p>
              <p className="text-xs text-gray-500">carbs</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-500">{totalFat}g</p>
              <p className="text-xs text-gray-500">fat</p>
            </div>
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
                        <span>P: {log.protein_g}g</span>
                        <span>C: {log.carbs_g}g</span>
                        <span>F: {log.fat_g}g</span>
                      </div>
                      {log.notes && <p className="text-xs text-gray-400 mt-1 italic">{log.notes}</p>}
                    </div>
                    <button
                      onClick={() => deleteLog(log.id)}
                      disabled={deleting === log.id}
                      className="text-gray-300 hover:text-red-400 transition-colors text-lg shrink-0 mt-0.5"
                      title="Remove entry"
                    >
                      {deleting === log.id ? '...' : '×'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}