'use client'

import { useUser } from '@clerk/nextjs'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

type SearchResult = {
  name: string
  serving: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  cal_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fiber_per_100g?: number
}

function calcMacros(food: SearchResult, qty: number, unit: string) {
  if (!qty || qty <= 0) return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

  // Convert everything to grams first
  let grams = qty
  if (unit === 'oz') grams = qty * 28.35
  else if (unit === 'lbs') grams = qty * 453.6
  else if (unit === 'ml') grams = qty * 1 // ~1g per ml for most foods/drinks
  else if (unit === 'cup') grams = qty * 240
  else if (unit === 'tbsp') grams = qty * 15
  else if (unit === 'tsp') grams = qty * 5
  else if (unit === 'serving') {
    return {
      calories: Math.round(food.calories * qty),
      protein_g: Math.round(food.protein_g * qty),
      carbs_g: Math.round(food.carbs_g * qty),
      fat_g: Math.round(food.fat_g * qty),
      fiber_g: Number(((food.fiber_g || 0) * qty).toFixed(1)),
    }
  }

  const factor = grams / 100
  return {
    calories: Math.round(food.cal_per_100g * factor),
    protein_g: Math.round(food.protein_per_100g * factor),
    carbs_g: Math.round(food.carbs_per_100g * factor),
    fat_g: Math.round(food.fat_per_100g * factor),
    fiber_g: Number(((food.fiber_per_100g || 0) * factor).toFixed(1)),
  }
}

export default function NewLogPage() {
  const { user } = useUser()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedFood, setSelectedFood] = useState<SearchResult | null>(null)
  const [qty, setQty] = useState('100')
  const [unit, setUnit] = useState('g')
  const [mealSlot, setMealSlot] = useState('breakfast')
  const [notes, setNotes] = useState('')
  // Manual mode
  const [manualMode, setManualMode] = useState(false)
  const [manualForm, setManualForm] = useState({ food_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' })
  // Date — defaults to today (local date, not UTC — avoids off-by-one for US users at night)
  function localDateString(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const [logDate, setLogDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('date')
      if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return p
    }
    return localDateString()
  })
  // Track foods saved this session so user can keep adding without leaving the page
  const [savedFoods, setSavedFoods] = useState<string[]>([])

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSelectedFood(null)
    setSearchError('')
    try {
      const email = user?.primaryEmailAddress?.emailAddress || ''
      const res = await fetch(`/api/food-search?q=${encodeURIComponent(searchQuery)}&email=${encodeURIComponent(email)}`)
      const data = await res.json()
      const results = data.results || []
      setSearchResults(results)
      if (results.length === 0) setSearchError('No results found — try a different name or use "Enter manually"')
    } catch {
      setSearchResults([])
      setSearchError('Search unavailable — use "Enter manually" to log this food')
    } finally {
      setSearching(false)
    }
  }

  // Returns true if the food has a named serving (e.g. "1 strip (8g)") vs a raw weight like "100g"
  function isNamedServing(serving: string): boolean {
    return !/^\d+(\.\d+)?(g|oz|ml)$/i.test(serving.trim())
  }

  function selectFood(result: SearchResult) {
    setSelectedFood(result)
    setSearchResults([])
    setManualMode(false)
    // If the food has a named serving (e.g. "1 strip (8g)"), default to serving mode
    if (isNamedServing(result.serving)) {
      setUnit('serving')
      setQty('1')
    } else {
      setQty('100')
      setUnit('g')
    }
  }

  const computed = selectedFood ? calcMacros(selectedFood, Number(qty), unit) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user?.primaryEmailAddress?.emailAddress) return
    setSaving(true)
    try {
      const payload = manualMode
        ? {
            food_name: manualForm.food_name,
            calories: Number(manualForm.calories) || 0,
            protein_g: Number(manualForm.protein_g) || 0,
            carbs_g: Number(manualForm.carbs_g) || 0,
            fat_g: Number(manualForm.fat_g) || 0,
            meal_slot: mealSlot,
            notes,
          }
        : {
            food_name: unit === 'serving' && selectedFood
              ? `${selectedFood.name} (${qty}x ${selectedFood.serving})`
              : `${selectedFood?.name} (${qty}${unit})`,
            calories: computed?.calories || 0,
            protein_g: computed?.protein_g || 0,
            carbs_g: computed?.carbs_g || 0,
            fat_g: computed?.fat_g || 0,
            fiber_g: computed?.fiber_g || 0,
            meal_slot: mealSlot,
            notes,
          }

      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, email: user.primaryEmailAddress.emailAddress, date: logDate }),
      })
      if (res.ok) {
        // Stay on the page — record what was saved and reset for the next food
        const savedName = manualMode
          ? manualForm.food_name
          : unit === 'serving' && selectedFood
            ? `${selectedFood.name} (${qty}x ${selectedFood.serving})`
            : `${selectedFood?.name} (${qty}${unit})`
        setSavedFoods(prev => [...prev, savedName])
        // Reset search/selection but keep meal slot + date so they can quickly add more
        setSelectedFood(null)
        setSearchQuery('')
        setSearchResults([])
        setSearchError('')
        setQty('1')
        setUnit('serving')
        setNotes('')
        setManualForm({ food_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' })
      } else {
        const errData = await res.json().catch(() => ({}))
        if (res.status === 404) {
          alert('We couldn\'t find your account — please email support at worthfittraining@gmail.com so we can fix this quickly!')
        } else {
          alert(`Failed to save (error ${res.status}). Please try again or contact support.`)
        }
      }
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = manualMode ? !!manualForm.food_name : (!!selectedFood && Number(qty) > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { router.push(`/log?date=${logDate}`) }} className="text-sm text-gray-500 hover:text-gray-700">← Back to Log</button>
          <h1 className="text-lg font-bold text-gray-800">Add Food</h1>
          <button onClick={() => { setManualMode(m => !m); setSelectedFood(null) }} className="text-sm text-green-600 hover:underline">
            {manualMode ? 'Search instead' : 'Enter manually'}
          </button>
        </div>

        {/* Saved foods this session — shows after first save */}
        {savedFoods.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-green-800">✅ Added to your log</p>
              <button
                onClick={() => { router.push(`/log?date=${logDate}`) }}
                className="text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-full transition-colors"
              >
                Done → View Log
              </button>
            </div>
            <ul className="space-y-0.5">
              {savedFoods.map((name, i) => (
                <li key={i} className="text-sm text-green-700">• {name}</li>
              ))}
            </ul>
            <p className="text-xs text-green-600 mt-1.5">Keep adding below, or tap "Done" when finished.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!manualMode ? (
            <>
              {/* Search */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">🔍 Search for a food</p>
                <div className="flex gap-2">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                    placeholder="e.g. sourdough bread, chicken breast..."
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800 placeholder:text-gray-600"
                  />
                  <button type="button" onClick={handleSearch} disabled={searching}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:bg-gray-300">
                    {searching ? '...' : 'Search'}
                  </button>
                </div>

                {searchError && (
                  <p className="mt-2 text-xs text-red-500">{searchError}</p>
                )}

                {searchResults.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {searchResults.map((r, i) => (
                      <button key={i} type="button" onClick={() => selectFood(r)}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-green-50 border border-gray-100 transition-colors">
                        <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {isNamedServing(r.serving) ? (
                            <span className="text-green-600 font-medium mr-1.5">Serving: {r.serving} · {r.calories} cal</span>
                          ) : null}
                          {r.cal_per_100g} cal · {r.protein_per_100g}g pro · {r.carbs_per_100g}g carbs · {r.fat_per_100g}g fat
                          <span className="text-gray-500 ml-1">per 100g</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantity picker — shown after selecting a food */}
              {selectedFood && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{selectedFood.name}</p>
                      <p className="text-xs text-gray-500">Serving: {selectedFood.serving}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedFood(null)} className="text-gray-500 hover:text-gray-600 text-lg">×</button>
                  </div>

                  <p className="text-sm font-medium text-gray-700 mb-2">How much did you have?</p>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={qty}
                      onChange={e => setQty(e.target.value)}
                      className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                    />
                    <select
                      value={unit}
                      onChange={e => {
                        const newUnit = e.target.value
                        setUnit(newUnit)
                        // Auto-reset qty when switching to/from servings
                        // so the macro display is always sensible
                        if (newUnit === 'serving') setQty('1')
                        else if (unit === 'serving') setQty('1')
                      }}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                    >
                      <option value="g">grams (g)</option>
                      <option value="oz">ounces (oz)</option>
                      <option value="lbs">pounds (lbs)</option>
                      <option value="ml">milliliters (ml)</option>
                      <option value="cup">cups</option>
                      <option value="tbsp">tablespoons (tbsp)</option>
                      <option value="tsp">teaspoons (tsp)</option>
                      <option value="serving">
                        {selectedFood && isNamedServing(selectedFood.serving) ? selectedFood.serving : 'serving'}
                      </option>
                    </select>
                  </div>

                  {computed && Number(qty) > 0 && (
                    <div className="bg-white rounded-xl p-3 grid grid-cols-5 gap-2 text-center">
                      <div><div className="font-bold text-gray-800">{computed.calories}</div><div className="text-xs text-gray-500">cal</div></div>
                      <div><div className="font-bold text-green-600">{computed.protein_g}g</div><div className="text-xs text-gray-500">protein</div></div>
                      <div><div className="font-bold text-blue-600">{computed.carbs_g}g</div><div className="text-xs text-gray-500">carbs</div></div>
                      <div><div className="font-bold text-orange-500">{computed.fat_g}g</div><div className="text-xs text-gray-500">fat</div></div>
                      <div><div className="font-bold text-teal-600">{computed.fiber_g}g</div><div className="text-xs text-gray-500">fiber</div></div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Manual entry */
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Food name *</label>
                <input value={manualForm.food_name} onChange={e => setManualForm(p => ({ ...p, food_name: e.target.value }))}
                  required placeholder="e.g. Chicken breast 6oz"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800 placeholder:text-gray-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[['calories','Calories'],['protein_g','Protein (g)'],['carbs_g','Carbs (g)'],['fat_g','Fat (g)'],['fiber_g','Fiber (g)']].map(([k,l]) => (
                  <div key={k}>
                    <label className="text-xs font-medium text-gray-500 block mb-1">{l}</label>
                    <input type="number" min="0" value={manualForm[k as keyof typeof manualForm]}
                      onChange={e => {
                        const val = e.target.value
                        if (k === 'calories' || k === 'fiber_g') {
                          setManualForm(p => ({ ...p, [k]: val }))
                        } else {
                          setManualForm(p => {
                            const updated = { ...p, [k]: val }
                            const protein = Number(k === 'protein_g' ? val : updated.protein_g) || 0
                            const carbs = Number(k === 'carbs_g' ? val : updated.carbs_g) || 0
                            const fat = Number(k === 'fat_g' ? val : updated.fat_g) || 0
                            const auto = Math.round(protein * 4 + carbs * 4 + fat * 9)
                            return { ...updated, calories: auto > 0 ? String(auto) : '' }
                          })
                        }
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meal + Date + Notes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Meal</label>
                <div className="grid grid-cols-2 gap-1">
                  {MEAL_SLOTS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMealSlot(s)}
                      className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                        mealSlot === s
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Date</label>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                />
              </div>
            </div>
            {logDate !== localDateString() && (
              <p className="text-xs text-green-600 font-medium">
                {logDate > localDateString() ? '📅 Logging ahead for this date' : '📋 Logging for a past date'}
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any extra details..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800 resize-none placeholder:text-gray-600" />
            </div>
          </div>

          <button type="submit" disabled={saving || !canSave}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors">
            {saving ? 'Saving...' : 'Save to Food Log'}
          </button>
          {!canSave && !saving && (
            <p className="text-center text-xs text-gray-500 mt-2">
              {manualMode ? 'Enter a food name above to save' : 'Search for a food above to save'}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}