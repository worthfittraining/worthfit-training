'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type MacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type FoodLog = {
  id: string
  food_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  meal_slot: string
}

export default function DashboardPage() {
  const { user } = useUser()
  const [totals, setTotals] = useState<MacroTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [targets, setTargets] = useState<MacroTotals>({ calories: 2000, protein: 150, carbs: 200, fat: 65 })
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!user?.primaryEmailAddress?.emailAddress) return
      const email = user.primaryEmailAddress.emailAddress

      try {
        const [logRes, profileRes] = await Promise.all([
          fetch(`/api/log?email=${encodeURIComponent(email)}`),
          fetch(`/api/profile?email=${encodeURIComponent(email)}`),
        ])

        const logData = await logRes.json()
        const fetchedLogs: FoodLog[] = Array.isArray(logData) ? logData : (logData.logs || [])
        setLogs(fetchedLogs)

        setTotals({
          calories: fetchedLogs.reduce((s, l) => s + (Number(l.calories) || 0), 0),
          protein: fetchedLogs.reduce((s, l) => s + (Number(l.protein_g) || 0), 0),
          carbs: fetchedLogs.reduce((s, l) => s + (Number(l.carbs_g) || 0), 0),
          fat: fetchedLogs.reduce((s, l) => s + (Number(l.fat_g) || 0), 0),
        })

        if (profileRes.ok) {
          const profile = await profileRes.json()
          if (profile.Calories) {
            setTargets({
              calories: Number(profile.Calories) || 2000,
              protein: Number(profile.Protein_g) || 150,
              carbs: Number(profile.Carbs_g) || 200,
              fat: Number(profile.Fat_g) || 65,
            })
          }
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  const firstName = user?.firstName || 'there'
  const calPct = Math.min((totals.calories / targets.calories) * 100, 100)
  const remaining = Math.max(targets.calories - totals.calories, 0)

  // Greeting based on time of day
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Motivational message based on progress
  function getMotivation() {
    if (totals.calories === 0) return "Ready to start logging? Let's hit those goals! 💪"
    if (calPct < 33) return "Great start! Keep adding meals to fuel your day."
    if (calPct < 66) return "You're halfway there! Stay consistent."
    if (calPct < 90) return "Almost at your target — finishing strong!"
    if (calPct <= 100) return "You've hit your calorie goal today! 🎉"
    return "You've gone over your calorie goal today."
  }

  // SVG donut ring
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (calPct / 100) * circumference

  function ProgressBar({ value, target, color }: { value: number; target: number; color: string }) {
    const pct = Math.min(Math.round((value / target) * 100), 100)
    return (
      <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
        <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    )
  }

  // Get recent 3 logs
  const recentLogs = logs.slice(0, 3)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{greeting}, {firstName}! 👋</h1>
          <p className="text-gray-500 text-sm mt-1">{getMotivation()}</p>
        </div>

        {/* Calorie Ring Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-6">
            {/* Donut */}
            <div className="relative flex-shrink-0">
              <svg width="128" height="128" className="-rotate-90">
                <circle cx="64" cy="64" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="12" />
                <circle
                  cx="64" cy="64" r={radius} fill="none"
                  stroke={calPct >= 100 ? '#ef4444' : '#22c55e'}
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={loading ? circumference : dashOffset}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-800">{loading ? '—' : totals.calories}</span>
                <span className="text-xs text-gray-400">kcal</span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Goal</span>
                <span className="font-medium text-gray-800">{targets.calories} kcal</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Eaten</span>
                <span className="font-medium text-gray-800">{totals.calories} kcal</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Remaining</span>
                <span className={`font-medium ${remaining === 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {remaining} kcal
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Meals logged</span>
                <span className="font-medium text-gray-800">{logs.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Macros */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-xs font-semibold text-gray-400 mb-4 tracking-wide">MACROS</h2>
          {loading ? (
            <div className="text-center text-gray-400 py-4">Loading...</div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-green-700">Protein</span>
                  <span className="text-gray-500">{totals.protein}g / {targets.protein}g</span>
                </div>
                <ProgressBar value={totals.protein} target={targets.protein} color="bg-green-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-blue-700">Carbs</span>
                  <span className="text-gray-500">{totals.carbs}g / {targets.carbs}g</span>
                </div>
                <ProgressBar value={totals.carbs} target={targets.carbs} color="bg-blue-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-orange-600">Fat</span>
                  <span className="text-gray-500">{totals.fat}g / {targets.fat}g</span>
                </div>
                <ProgressBar value={totals.fat} target={targets.fat} color="bg-orange-400" />
              </div>
            </div>
          )}
        </div>

        {/* Recent Logs */}
        {recentLogs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-semibold text-gray-400 tracking-wide">RECENT MEALS</h2>
              <Link href="/log" className="text-xs text-green-600 font-medium">See all →</Link>
            </div>
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">{log.food_name}</p>
                    <p className="text-xs text-gray-400 capitalize">{log.meal_slot}</p>
                  </div>
                  <span className="text-sm font-medium text-gray-600">{log.calories} kcal</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 mb-3 tracking-wide">QUICK ACTIONS</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/log" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-2">🍽️</div>
              <div className="font-semibold text-gray-800 text-sm">Log Food</div>
              <div className="text-xs text-gray-500 mt-1">Photo, barcode, or manual</div>
            </Link>
            <Link href="/chat" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-2">💬</div>
              <div className="font-semibold text-gray-800 text-sm">Ask Nali</div>
              <div className="text-xs text-gray-500 mt-1">Get nutrition advice</div>
            </Link>
            <Link href="/meal-plan" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-2">📋</div>
              <div className="font-semibold text-gray-800 text-sm">Meal Plan</div>
              <div className="text-xs text-gray-500 mt-1">See this week's meals</div>
            </Link>
            <Link href="/log" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-2">📊</div>
              <div className="font-semibold text-gray-800 text-sm">Full Log</div>
              <div className="text-xs text-gray-500 mt-1">View today's entries</div>
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
