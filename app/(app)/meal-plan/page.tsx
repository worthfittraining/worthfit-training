'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

type Meal = {
  id?: string
  recipe_name: unknown
  day: unknown
  meal_slot: unknown
  calories: unknown
  protein_g: unknown
  carbs_g: unknown
  fat_g: unknown
  notes: unknown
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

export default function MealPlanPage() {
  const { user } = useUser()
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedDay, setSelectedDay] = useState(0)

  useEffect(() => {
    fetchMealPlan()
  }, [user])

  async function fetchMealPlan() {
    if (!user?.primaryEmailAddress?.emailAddress) return
    try {
      const res = await fetch(`/api/meal-plan?email=${encodeURIComponent(user.primaryEmailAddress!.emailAddress)}`)
      const data = await res.json()
      const entries = Array.isArray(data) ? data : (data.meals || [])
      setMeals(entries)
    } catch (err) {
      console.error('Failed to fetch meal plan:', err)
    } finally {
      setLoading(false)
    }
  }

  async function generateMealPlan() {
    if (!user?.primaryEmailAddress?.emailAddress) return
    setGenerating(true)
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.primaryEmailAddress!.emailAddress }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const entries = Array.isArray(data) ? data : (data.meals || [])
      setMeals(entries)
    } catch (err) {
      console.error('Failed to generate meal plan:', err)
      alert('Something went wrong. Please try again!')
    } finally {
      setGenerating(false)
    }
  }

  const dayMeals = meals.filter(m =>
    String(m.day).toLowerCase() === DAYS[selectedDay].toLowerCase()
  )
  const bySlot = MEAL_SLOTS
    .map(slot => ({
      slot,
      meal: dayMeals.find(m => String(m.meal_slot).toLowerCase() === slot),
    }))
    .filter(s => s.meal)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</a>
          <h1 className="text-lg font-bold text-gray-800">This Week's Meals</h1>
          <button
            onClick={generateMealPlan}
            disabled={generating}
            className="bg-green-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors"
          >
            {generating ? 'Generating...' : '✨ Generate Plan'}
          </button>
        </div>

        <div className="flex gap-1 mb-6 bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
          {DAY_ABBREV.map((day, i) => (
            <button
              key={day}
              onClick={() => setSelectedDay(i)}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors ${
                selectedDay === i ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">Loading...</div>
        ) : generating ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">✨</div>
            <p className="text-gray-600 font-medium">Nali is creating your meal plan...</p>
            <p className="text-gray-400 text-sm mt-2">This takes about 15–20 seconds</p>
          </div>
        ) : meals.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-gray-600 font-medium mb-2">No meal plan yet</p>
            <p className="text-gray-400 text-sm mb-6">Click "✨ Generate Plan" and Nali will create a personalized week of meals based on your goals!</p>
          </div>
        ) : bySlot.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No meals planned for {DAYS[selectedDay]}
          </div>
        ) : (
          <div className="space-y-3">
            {bySlot.map(({ slot, meal }) => meal && (
              <div key={slot} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1 capitalize">{slot}</div>
                <div className="font-medium text-gray-800 mb-2">{String(meal.recipe_name || '')}</div>
                {meal.notes ? <div className="text-sm text-gray-500 mb-3">{String(meal.notes)}</div> : null}
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{Number(meal.calories) || 0} cal</span>
                  <span>{Number(meal.protein_g) || 0}g protein</span>
                  <span>{Number(meal.carbs_g) || 0}g carbs</span>
                  <span>{Number(meal.fat_g) || 0}g fat</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}