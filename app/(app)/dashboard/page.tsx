'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type MacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

type FoodLog = {
  id: string
  food_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  meal_slot: string
}

const WATER_STORAGE_KEY = () => `water_${new Date().toISOString().split('T')[0]}`

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function DashboardPage() {
  const { user } = useUser()
  const [totals, setTotals] = useState<MacroTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
  const [targets, setTargets] = useState<MacroTotals & { fiber: number }>({ calories: 2000, protein: 150, carbs: 200, fat: 65, fiber: 28 })
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [waterOz, setWaterOz] = useState(0)
  const [waterGoal, setWaterGoal] = useState(64)

  const todayName = DAYS[new Date().getDay()]

  // Load water from localStorage (resets daily automatically via date key)
  useEffect(() => {
    const saved = localStorage.getItem(WATER_STORAGE_KEY())
    if (saved) setWaterOz(Number(saved))
  }, [])

  function addWater(oz: number) {
    setWaterOz(prev => {
      const next = Math.max(0, prev + oz)
      localStorage.setItem(WATER_STORAGE_KEY(), String(next))
      return next
    })
  }

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
          fiber: Number(fetchedLogs.reduce((s, l) => s + (Number(l.fiber_g) || 0), 0).toFixed(1)),
        })

        if (profileRes.ok) {
          const profile = await profileRes.json()
          // Try to load today's day-specific macros first
          let usedDayMacros = false
          if (profile.Weekly_Macros) {
            try {
              const weekly = JSON.parse(profile.Weekly_Macros)
              const todayMacros = weekly[todayName]
              if (todayMacros) {
                setTargets({
                  calories: Number(todayMacros.calories) || 2000,
                  protein: Number(todayMacros.protein_g) || 150,
                  carbs: Number(todayMacros.carbs_g) || 200,
                  fat: Number(todayMacros.fat_g) || 65,
                })
                usedDayMacros = true
              }
            } catch { /* fall through to default */ }
          }
          if (!usedDayMacros && profile.Calories) {
            setTargets({
              calories: Number(profile.Calories) || 2000,
              protein: Number(profile.Protein_g) || 150,
              carbs: Number(profile.Carbs_g) || 200,
              fat: Number(profile.Fat_g) || 65,
              fiber: Number(profile.Fiber_g) || 28,
            })
          }
          if (profile.Water_goal_oz) setWaterGoal(Number(profile.Water_goal_oz))
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user, todayName])

  const firstName = user?.firstName || 'there'
  const calPct = Math.min((totals.calories / targets.calories) * 100, 100)
  const remaining = Math.max(targets.calories - totals.calories, 0)

  // Within-target helpers (±5g for macros, ±50 cal for calories)
  const calHit = !loading && totals.calories > 0 && Math.abs(totals.calories - targets.calories) <= 50
  const proteinHit = !loading && totals.protein > 0 && Math.abs(totals.protein - targets.protein) <= 5
  const carbsHit = !loading && totals.carbs > 0 && Math.abs(totals.carbs - targets.carbs) <= 5
  const fatHit = !loading && totals.fat > 0 && Math.abs(totals.fat - targets.fat) <= 5
  const fiberHit = !loading && totals.fiber >= targets.fiber
  const waterHit = waterOz >= waterGoal
  const allMacrosHit = proteinHit && carbsHit && fatHit && calHit

  // Greeting based on time of day
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Motivational message based on progress
  function getMotivation() {
    if (allMacrosHit) return "🏆 You nailed all your macros today!"
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

  function MacroRow({
    label, value, target, color, barColor, hit
  }: {
    label: string; value: number; target: number; color: string; barColor: string; hit: boolean
  }) {
    const pct = Math.min(Math.round((value / target) * 100), 100)
    return (
      <div>
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-1.5">
            <span className={`font-medium ${color}`}>{label}</span>
            {hit && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-green-500 rounded-full text-white text-xs leading-none">✓</span>
            )}
          </div>
          <span className="text-gray-500">{value}g / {target}g</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${hit ? 'bg-green-500' : barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  // Get recent 3 logs
  const recentLogs = logs.slice(0, 3)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{greeting}, {firstName}! 👋</h1>
            <p className="text-gray-500 text-sm mt-1">{getMotivation()}</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="text-right text-xs text-gray-400">
              <div className="font-medium text-gray-600">{todayName}</div>
            </div>
            <Link href="/account" className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold shadow-sm hover:bg-green-600 transition-colors flex-shrink-0">
              {(user?.firstName?.[0] || user?.primaryEmailAddress?.emailAddress?.[0] || '?').toUpperCase()}
            </Link>
          </div>
        </div>

        {/* All macros hit celebration banner */}
        {allMacrosHit && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="font-semibold text-green-800 text-sm">Macro goals achieved!</p>
              <p className="text-green-600 text-xs mt-0.5">You hit all your targets today. Amazing work!</p>
            </div>
          </div>
        )}

        {/* Calorie Ring Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-6">
            {/* Donut */}
            <div className="relative flex-shrink-0">
              <svg width="128" height="128" className="-rotate-90">
                <circle cx="64" cy="64" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="12" />
                <circle
                  cx="64" cy="64" r={radius} fill="none"
                  stroke={calHit ? '#22c55e' : calPct >= 100 ? '#ef4444' : '#22c55e'}
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={loading ? circumference : dashOffset}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {calHit ? (
                  <span className="text-2xl">✅</span>
                ) : (
                  <>
                    <span className="text-xl font-bold text-gray-800">{loading ? '—' : totals.calories}</span>
                    <span className="text-xs text-gray-400">kcal</span>
                  </>
                )}
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
                <span className={`font-medium ${calHit ? 'text-green-600' : remaining === 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {calHit ? '✓ On target!' : `${remaining} kcal`}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 tracking-wide">MACROS</h2>
            {(proteinHit || carbsHit || fatHit) && !allMacrosHit && (
              <span className="text-xs text-green-600 font-medium">
                {[proteinHit && 'P', carbsHit && 'C', fatHit && 'F'].filter(Boolean).join(', ')} on target!
              </span>
            )}
          </div>
          {loading ? (
            <div className="text-center text-gray-400 py-4">Loading...</div>
          ) : (
            <div className="space-y-3">
              <MacroRow label="Protein" value={totals.protein} target={targets.protein} color="text-green-700" barColor="bg-green-500" hit={proteinHit} />
              <MacroRow label="Carbs" value={totals.carbs} target={targets.carbs} color="text-blue-700" barColor="bg-blue-500" hit={carbsHit} />
              <MacroRow label="Fat" value={totals.fat} target={targets.fat} color="text-orange-600" barColor="bg-orange-400" hit={fatHit} />
            </div>
          )}
        </div>

        {/* Fiber Ring + Water Tracker */}
        <div className="grid grid-cols-2 gap-4">
          {/* Fiber Ring */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center">
            <h2 className="text-xs font-semibold text-gray-400 tracking-wide mb-3 self-start">FIBER</h2>
            {(() => {
              const fiberPct = Math.min((totals.fiber / targets.fiber) * 100, 100)
              const r = 36, circ = 2 * Math.PI * r
              const offset = circ - (fiberPct / 100) * circ
              return (
                <div className="relative">
                  <svg width="90" height="90" className="-rotate-90">
                    <circle cx="45" cy="45" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                    <circle cx="45" cy="45" r={r} fill="none"
                      stroke={fiberHit ? '#22c55e' : '#14b8a6'}
                      strokeWidth="10"
                      strokeDasharray={circ}
                      strokeDashoffset={loading ? circ : offset}
                      strokeLinecap="round"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {fiberHit ? (
                      <span className="text-lg">✅</span>
                    ) : (
                      <>
                        <span className="text-sm font-bold text-gray-800">{loading ? '—' : totals.fiber}g</span>
                        <span className="text-xs text-gray-400">fiber</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })()}
            <p className="text-xs text-gray-400 mt-2">Goal: {targets.fiber}g</p>
          </div>

          {/* Water Tracker */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center">
            <h2 className="text-xs font-semibold text-gray-400 tracking-wide mb-3 self-start">WATER</h2>
            {(() => {
              const waterPct = Math.min((waterOz / waterGoal) * 100, 100)
              const r = 36, circ = 2 * Math.PI * r
              const offset = circ - (waterPct / 100) * circ
              return (
                <div className="relative">
                  <svg width="90" height="90" className="-rotate-90">
                    <circle cx="45" cy="45" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                    <circle cx="45" cy="45" r={r} fill="none"
                      stroke={waterHit ? '#22c55e' : '#3b82f6'}
                      strokeWidth="10"
                      strokeDasharray={circ}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {waterHit ? (
                      <span className="text-lg">✅</span>
                    ) : (
                      <>
                        <span className="text-sm font-bold text-gray-800">{waterOz}oz</span>
                        <span className="text-xs text-gray-400">water</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="flex gap-2 mt-2">
              <button onClick={() => addWater(-8)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg border border-gray-200">-8oz</button>
              <button onClick={() => addWater(8)} className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${waterHit ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>+8oz</button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Goal: {waterGoal}oz</p>
          </div>
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
            <Link href="/macros" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-2">🎯</div>
              <div className="font-semibold text-gray-800 text-sm">My Macros</div>
              <div className="text-xs text-gray-500 mt-1">Set targets per day</div>
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
