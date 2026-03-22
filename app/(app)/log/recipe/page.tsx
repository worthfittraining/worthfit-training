'use client'

import { useUser } from '@clerk/nextjs'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']
const UNITS = ['g', 'oz', 'lbs', 'ml', 'cup', 'tbsp', 'tsp', 'serving']

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

type Ingredient = {
  id: string
  food: SearchResult
  qty: number
  unit: string
}

function calcIngredientMacros(food: SearchResult, qty: number, unit: string) {
  if (!qty || qty <= 0) return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  let grams = qty
  if (unit === 'oz') grams = qty * 28.35
  else if (unit === 'lbs') grams = qty * 453.6
  else if (unit === 'ml') grams = qty
  else if (unit === 'cup') grams = qty * 240
  else if (unit === 'tbsp') grams = qty * 15
  else if (unit === 'tsp') grams = qty * 5
  else if (unit === 'serving') {
    return {
      calories: Math.round(food.calories * qty),
      protein_g: Math.round(food.protein_g * qty * 10) / 10,
      carbs_g: Math.round(food.carbs_g * qty * 10) / 10,
      fat_g: Math.round(food.fat_g * qty * 10) / 10,
    }
  }
  const factor = grams / 100
  return {
    calories: Math.round(food.cal_per_100g * factor),
    protein_g: Math.round(food.protein_per_100g * factor * 10) / 10,
    carbs_g: Math.round(food.carbs_per_100g * factor * 10) / 10,
    fat_g: Math.round(food.fat_per_100g * factor * 10) / 10,
  }
}

export default function RecipePage() {
  const { user } = useUser()
  const router = useRouter()

  const [recipeName, setRecipeName] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [totalServings, setTotalServings] = useState('4')
  const [servingsEaten, setServingsEaten] = useState('1')
  const [mealSlot, setMealSlot] = useState('lunch')
  const [saving, setSaving] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  // Manual ingredient state
  const [manualMode, setManualMode] = useState(false)
  const [manualIngredient, setManualIngredient] = useState({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' })

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/food-search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  function addIngredient(food: SearchResult) {
    setIngredients(prev => [...prev, {
      id: crypto.randomUUID(),
      food,
      qty: 100,
      unit: 'g',
    }])
    setSearchQuery('')
    setSearchResults([])
    setShowSearch(false)
  }

  function addManualIngredient() {
    if (!manualIngredient.name) return
    const fakeFood: SearchResult = {
      name: manualIngredient.name,
      serving: '100g',
      calories: Number(manualIngredient.calories) || 0,
      protein_g: Number(manualIngredient.protein_g) || 0,
      carbs_g: Number(manualIngredient.carbs_g) || 0,
      fat_g: Number(manualIngredient.fat_g) || 0,
      cal_per_100g: Number(manualIngredient.calories) || 0,
      protein_per_100g: Number(manualIngredient.protein_g) || 0,
      carbs_per_100g: Number(manualIngredient.carbs_g) || 0,
      fat_per_100g: Number(manualIngredient.fat_g) || 0,
    }
    addIngredient(fakeFood)
    setManualIngredient({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' })
    setManualMode(false)
  }

  function updateIngredient(id: string, field: 'qty' | 'unit', value: string | number) {
    setIngredients(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  function removeIngredient(id: string) {
    setIngredients(prev => prev.filter(i => i.id !== id))
  }

  // Total macros for the whole recipe
  const recipeTotals = ingredients.reduce((acc, ing) => {
    const m = calcIngredientMacros(ing.food, ing.qty, ing.unit)
    return {
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
    }
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  const servings = Math.max(Number(totalServings) || 1, 0.1)
  const eaten = Math.max(Number(servingsEaten) || 1, 0.1)
  const ratio = eaten / servings

  // Macros per serving eaten
  const loggedMacros = {
    calories: Math.round(recipeTotals.calories * ratio),
    protein_g: Math.round(recipeTotals.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(recipeTotals.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(recipeTotals.fat_g * ratio * 10) / 10,
  }

  // Per-single-serving for display
  const perServing = {
    calories: Math.round(recipeTotals.calories / servings),
    protein_g: Math.round(recipeTotals.protein_g / servings * 10) / 10,
    carbs_g: Math.round(recipeTotals.carbs_g / servings * 10) / 10,
    fat_g: Math.round(recipeTotals.fat_g / servings * 10) / 10,
  }

  async function handleSave() {
    if (!user?.primaryEmailAddress?.emailAddress || !recipeName || ingredients.length === 0) return
    setSaving(true)
    try {
      const name = servingsEaten === '1'
        ? `${recipeName} (1 serving)`
        : `${recipeName} (${servingsEaten} servings)`

      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.primaryEmailAddress.emailAddress,
          food_name: name,
          calories: loggedMacros.calories,
          protein_g: loggedMacros.protein_g,
          carbs_g: loggedMacros.carbs_g,
          fat_g: loggedMacros.fat_g,
          meal_slot: mealSlot,
          notes: `Recipe: ${ingredients.length} ingredients, ${totalServings} servings total`,
        }),
      })
      if (res.ok) router.push('/log')
      else alert('Failed to save. Please try again.')
    } catch {
      alert('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!recipeName && ingredients.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <a href="/log" className="text-sm text-gray-500 hover:text-gray-700">← Back</a>
          <h1 className="text-lg font-bold text-gray-800">🍳 Recipe Builder</h1>
          <div className="w-12" />
        </div>

        {/* Recipe Name */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <label className="text-sm font-medium text-gray-700 block mb-2">Recipe Name</label>
          <input
            value={recipeName}
            onChange={e => setRecipeName(e.target.value)}
            placeholder="e.g. High Protein Pasta, Breakfast Bowl..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Ingredients */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Ingredients ({ingredients.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setManualMode(false); setShowSearch(s => !s) }}
                className="text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-medium hover:bg-orange-100 transition"
              >
                + Search
              </button>
              <button
                onClick={() => { setShowSearch(false); setManualMode(m => !m) }}
                className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200 transition"
              >
                + Manual
              </button>
            </div>
          </div>

          {/* Search panel */}
          {showSearch && (
            <div className="mb-4 p-3 bg-orange-50 rounded-xl border border-orange-100">
              <div className="flex gap-2 mb-2">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                  placeholder="Search ingredient..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:bg-gray-300"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button key={i} onClick={() => addIngredient(r)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-white hover:bg-orange-50 border border-gray-100 transition-colors">
                      <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
                      <div className="text-xs text-gray-400">{r.cal_per_100g} cal · {r.protein_per_100g}g P · per 100g</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual ingredient panel */}
          {manualMode && (
            <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <p className="text-xs font-medium text-gray-500 mb-2">Enter ingredient macros per 100g (or per serving)</p>
              <input value={manualIngredient.name} onChange={e => setManualIngredient(p => ({ ...p, name: e.target.value }))}
                placeholder="Ingredient name *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <div className="grid grid-cols-2 gap-2">
                {[['calories','Calories'],['protein_g','Protein (g)'],['carbs_g','Carbs (g)'],['fat_g','Fat (g)']].map(([k,l]) => (
                  <div key={k}>
                    <label className="text-xs text-gray-500 block mb-0.5">{l}</label>
                    <input type="number" min="0" value={manualIngredient[k as keyof typeof manualIngredient]}
                      onChange={e => setManualIngredient(p => ({ ...p, [k]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                ))}
              </div>
              <button onClick={addManualIngredient} disabled={!manualIngredient.name}
                className="w-full bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:bg-gray-300 transition">
                Add Ingredient
              </button>
            </div>
          )}

          {/* Ingredient list */}
          {ingredients.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">No ingredients yet — search or add manually above</p>
          ) : (
            <div className="space-y-3">
              {ingredients.map(ing => {
                const m = calcIngredientMacros(ing.food, ing.qty, ing.unit)
                return (
                  <div key={ing.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-gray-800 truncate pr-2">{ing.food.name}</p>
                      <button onClick={() => removeIngredient(ing.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0">×</button>
                    </div>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="number" min="0.1" step="0.1"
                        value={ing.qty}
                        onChange={e => updateIngredient(ing.id, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                      <select value={ing.unit} onChange={e => updateIngredient(ing.id, 'unit', e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">{m.calories} cal</span>
                      <span>{m.protein_g}g P</span>
                      <span>{m.carbs_g}g C</span>
                      <span>{m.fat_g}g F</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Servings */}
        {ingredients.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Servings</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Total servings this recipe makes</label>
                <input type="number" min="0.5" step="0.5" value={totalServings}
                  onChange={e => setTotalServings(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Servings you&apos;re eating now</label>
                <input type="number" min="0.5" step="0.5" value={servingsEaten}
                  onChange={e => setServingsEaten(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>

            {/* Full recipe totals */}
            <div className="bg-gray-50 rounded-xl p-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Whole Recipe</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><div className="font-bold text-gray-800 text-sm">{recipeTotals.calories}</div><div className="text-xs text-gray-400">cal</div></div>
                <div><div className="font-bold text-green-600 text-sm">{recipeTotals.protein_g}g</div><div className="text-xs text-gray-400">protein</div></div>
                <div><div className="font-bold text-blue-600 text-sm">{recipeTotals.carbs_g}g</div><div className="text-xs text-gray-400">carbs</div></div>
                <div><div className="font-bold text-orange-500 text-sm">{recipeTotals.fat_g}g</div><div className="text-xs text-gray-400">fat</div></div>
              </div>
            </div>

            {/* Per serving */}
            <div className="bg-gray-50 rounded-xl p-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Per Serving (÷{totalServings})</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><div className="font-bold text-gray-800 text-sm">{perServing.calories}</div><div className="text-xs text-gray-400">cal</div></div>
                <div><div className="font-bold text-green-600 text-sm">{perServing.protein_g}g</div><div className="text-xs text-gray-400">protein</div></div>
                <div><div className="font-bold text-blue-600 text-sm">{perServing.carbs_g}g</div><div className="text-xs text-gray-400">carbs</div></div>
                <div><div className="font-bold text-orange-500 text-sm">{perServing.fat_g}g</div><div className="text-xs text-gray-400">fat</div></div>
              </div>
            </div>

            {/* What you're logging */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-orange-600 mb-2 uppercase tracking-wide">You&apos;re Logging ({servingsEaten} serving{Number(servingsEaten) !== 1 ? 's' : ''})</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><div className="font-bold text-gray-900 text-sm">{loggedMacros.calories}</div><div className="text-xs text-gray-500">cal</div></div>
                <div><div className="font-bold text-green-700 text-sm">{loggedMacros.protein_g}g</div><div className="text-xs text-gray-500">protein</div></div>
                <div><div className="font-bold text-blue-700 text-sm">{loggedMacros.carbs_g}g</div><div className="text-xs text-gray-500">carbs</div></div>
                <div><div className="font-bold text-orange-600 text-sm">{loggedMacros.fat_g}g</div><div className="text-xs text-gray-500">fat</div></div>
              </div>
            </div>
          </div>
        )}

        {/* Meal slot */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
          <label className="text-sm font-medium text-gray-700 block mb-2">Meal</label>
          <select value={mealSlot} onChange={e => setMealSlot(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            {MEAL_SLOTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        <button onClick={handleSave} disabled={saving || !canSave}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm">
          {saving ? 'Saving...' : `Save to Log${loggedMacros.calories > 0 ? ` · ${loggedMacros.calories} cal` : ''}`}
        </button>
      </div>
    </div>
  )
}
