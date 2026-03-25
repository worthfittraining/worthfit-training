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
  cal_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
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
    }
  }

  const factor = grams / 100
  return {
    calories: Math.round(food.cal_per_100g * factor),
    protein_g: Math.round(food.protein_per_100g * factor),
    carbs_g: Math.round(food.carbs_per_100g * factor),
    fat_g: Math.round(food.fat_per_100g * factor),
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
  const [manualForm, setManualForm] = useState({ food_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' })
  // Date — defaults to today, can be changed for past/future logging
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])

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

  function selectFood(result: SearchResult) {
    setSelectedFood(result)
    setSearchResults([])
    setQty('100')
    setUnit('g')
    setManualMode(false)
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
            food_name: `${selectedFood?.name} (${qty}${unit})`,
            calories: computed?.calories || 0,
            protein_g: computed?.protein_g || 0,
            carbs_g: computed?.carbs_g || 0,
            fat_g: computed?.fat_g || 0,
            meal_slot: mealSlot,
            notes,
          }

      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, email: user.primaryEmailAddress.emailAddress, date: logDate }),
      })
      if (res.ok) router.push('/log')
      else alert('Failed to save. Please try again.')
    } catch {
      alert('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = manualMode ? !!manualForm.food_name : (!!selectedFood && Number(qty) > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <a href="/log" className="text-sm text-gray-500 hover:text-gray-700">← Back to Log</a>
          <h1 className="text-lg font-bold text-gray-800">Add Food</h1>
          <button onClick={() => { setManualMode(m => !m); setSelectedFood(null) }} className="text-sm text-green-600 hover:underline">
            {manualMode ? 'Search instead' : 'Enter manually'}
          </button>
        </div>

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
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
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
                        <div className="text-xs text-gray-400 mt-0.5">
                          {r.cal_per_100g} cal · {r.protein_per_100g}g protein · {r.carbs_per_100g}g carbs · {r.fat_per_100g}g fat
                          <span className="text-gray-300 ml-1">per 100g</span>
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
                    <button type="button" onClick={() => setSelectedFood(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
                  </div>

                  <p className="text-sm font-medium text-gray-700 mb-2">How much did you have?</p>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="number"
                      min="1"
                      value={qty}
                      onChange={e => setQty(e.target.value)}
                      className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <select value={unit} onChange={e => setUnit(e.target.value)}
  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
  <option value="g">grams (g)</option>
  <option value="oz">ounces (oz)</option>
  <option value="lbs">pounds (lbs)</option>
  <option value="ml">milliliters (ml)</option>
  <option value="cup">cups</option>
  <option value="tbsp">tablespoons (tbsp)</option>
  <option value="tsp">teaspoons (tsp)</option>
  <option value="serving">servings</option>
</select>
                  </div>

                  {computed && Number(qty) > 0 && (
                    <div className="bg-white rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
                      <div><div className="font-bold text-gray-800">{computed.calories}</div><div className="text-xs text-gray-400">cal</div></div>
                      <div><div className="font-bold text-green-600">{computed.protein_g}g</div><div className="text-xs text-gray-400">protein</div></div>
                      <div><div className="font-bold text-blue-600">{computed.carbs_g}g</div><div className="text-xs text-gray-400">carbs</div></div>
                      <div><div className="font-bold text-orange-500">{computed.fat_g}g</div><div className="text-xs text-gray-400">fat</div></div>
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
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[['calories','Calories'],['protein_g','Protein (g)'],['carbs_g','Carbs (g)'],['fat_g','Fat (g)']].map(([k,l]) => (
                  <div key={k}>
                    <label className="text-xs font-medium text-gray-500 block mb-1">{l}</label>
                    <input type="number" min="0" value={manualForm[k as keyof typeof manualForm]}
                      onChange={e => setManualForm(p => ({ ...p, [k]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
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
                <select value={mealSlot} onChange={e => setMealSlot(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  {MEAL_SLOTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Date</label>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            </div>
            {logDate !== new Date().toISOString().split('T')[0] && (
              <p className="text-xs text-green-600 font-medium">
                {logDate > new Date().toISOString().split('T')[0] ? '📅 Logging ahead for this date' : '📋 Logging for a past date'}
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any extra details..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
            </div>
          </div>

          <button type="submit" disabled={saving || !canSave}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors">
            {saving ? 'Saving...' : 'Save to Log'}
          </button>
        </form>
      </div>
    </div>
  )
}