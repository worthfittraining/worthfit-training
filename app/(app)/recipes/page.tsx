'use client'

import { useUser } from '@clerk/nextjs'
import { useState, useEffect, useCallback } from 'react'
import PlanGate from '@/app/components/PlanGate'

type SavedRecipe = {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  servings: number
  saved_at: string
}

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

function localDateString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function RecipesPage() {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress

  const [recipes, setRecipes] = useState<SavedRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [servingsToLog, setServingsToLog] = useState<Record<string, string>>({})
  const [mealSlot, setMealSlot] = useState<Record<string, string>>({})
  const [logging, setLogging] = useState<string | null>(null)
  const [logSuccess, setLogSuccess] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchRecipes = useCallback(async () => {
    if (!email) return
    setLoading(true)
    setFetchError(false)
    try {
      const res = await fetch(`/api/recipes?email=${encodeURIComponent(email)}`)
      if (!res.ok) { setFetchError(true); return }
      const data = await res.json()
      setRecipes(data.recipes || [])
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [email])

  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  function getServings(name: string) {
    return parseFloat(servingsToLog[name] || '1') || 1
  }

  function getMealSlot(name: string) {
    return mealSlot[name] || 'lunch'
  }

  function calcLogged(recipe: SavedRecipe, servings: number) {
    return {
      calories: Math.round(recipe.calories * servings),
      protein_g: Math.round(recipe.protein_g * servings * 10) / 10,
      carbs_g: Math.round(recipe.carbs_g * servings * 10) / 10,
      fat_g: Math.round(recipe.fat_g * servings * 10) / 10,
    }
  }

  async function handleLog(recipe: SavedRecipe) {
    if (!email) return
    const servings = getServings(recipe.name)
    const slot = getMealSlot(recipe.name)
    const macros = calcLogged(recipe, servings)
    const foodName = servings === 1
      ? `${recipe.name} (1 serving)`
      : `${recipe.name} (${servings} servings)`

    setLogging(recipe.name)
    setLogError(null)
    try {
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          food_name: foodName,
          calories: macros.calories,
          protein_g: macros.protein_g,
          carbs_g: macros.carbs_g,
          fat_g: macros.fat_g,
          meal_slot: slot,
          notes: `From saved recipe`,
          date: localDateString(),
        }),
      })
      if (res.ok) {
        setLogSuccess(recipe.name)
        setTimeout(() => setLogSuccess(null), 2500)
        setExpanded(null)
      } else {
        setLogError('Failed to save — please try again.')
        setTimeout(() => setLogError(null), 4000)
      }
    } catch {
      setLogError('Network error — check your connection and try again.')
      setTimeout(() => setLogError(null), 4000)
    } finally {
      setLogging(null)
    }
  }

  async function handleDelete(name: string) {
    if (!email) return
    setDeleting(name)
    try {
      await fetch('/api/recipes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      })
      setRecipes(prev => prev.filter(r => r.name !== name))
      setConfirmDelete(null)
      if (expanded === name) setExpanded(null)
    } finally {
      setDeleting(null)
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { return '' }
  }

  return (
    <PlanGate feature="recipe">
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <a href="/account" className="text-sm text-gray-500 hover:text-gray-700">← Back</a>
          <h1 className="text-lg font-bold text-gray-800">🍳 My Recipes</h1>
          <a href="/log/recipe" className="text-sm text-orange-600 font-semibold hover:text-orange-700">+ New</a>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-800"
          />
        </div>

        {/* Log success banner */}
        {logSuccess && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium text-center">
            ✅ {logSuccess} logged!
          </div>
        )}
        {/* Log error banner */}
        {logError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium text-center">
            ⚠️ {logError}
          </div>
        )}

        {/* Fetch error */}
        {fetchError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-4 text-sm text-red-700 text-center">
            <p className="font-semibold mb-1">Couldn't load recipes</p>
            <button onClick={fetchRecipes} className="underline text-red-600 hover:text-red-800">Tap to retry</button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading recipes...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="text-gray-500 text-sm mb-4">
              {search ? 'No recipes match your search.' : "You haven't saved any recipes yet."}
            </p>
            {!search && (
              <a href="/log/recipe"
                className="inline-block bg-orange-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition">
                Build Your First Recipe
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(recipe => {
              const isExpanded = expanded === recipe.name
              const servings = getServings(recipe.name)
              const logged = calcLogged(recipe, servings)
              const isLogging = logging === recipe.name
              const didLog = logSuccess === recipe.name
              const isConfirmingDelete = confirmDelete === recipe.name
              const isDeleting = deleting === recipe.name

              return (
                <div key={recipe.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Recipe card header */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : recipe.name)}
                    className="w-full text-left px-4 py-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-sm font-semibold text-gray-800 truncate">{recipe.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Saved {formatDate(recipe.saved_at)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-800">{recipe.calories} cal</p>
                          <p className="text-xs text-gray-500">per serving</p>
                        </div>
                        <span className="text-gray-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {/* Macro pills */}
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{recipe.protein_g}g P</span>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{recipe.carbs_g}g C</span>
                      <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{recipe.fat_g}g F</span>
                      <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">{recipe.servings} servings total</span>
                    </div>
                  </button>

                  {/* Expanded log panel */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">

                      {/* Servings + meal slot */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Servings to log</label>
                          <input
                            type="number" min="0.5" step="0.5"
                            value={servingsToLog[recipe.name] || '1'}
                            onChange={e => setServingsToLog(p => ({ ...p, [recipe.name]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-800"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Meal</label>
                          <select
                            value={getMealSlot(recipe.name)}
                            onChange={e => setMealSlot(p => ({ ...p, [recipe.name]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-800"
                          >
                            {MEAL_SLOTS.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Calculated macros preview */}
                      <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                        <p className="text-xs font-semibold text-orange-600 mb-2 uppercase tracking-wide">
                          You&apos;re logging ({servings} serving{servings !== 1 ? 's' : ''})
                        </p>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div><div className="font-bold text-gray-900 text-sm">{logged.calories}</div><div className="text-xs text-gray-500">cal</div></div>
                          <div><div className="font-bold text-green-700 text-sm">{logged.protein_g}g</div><div className="text-xs text-gray-500">protein</div></div>
                          <div><div className="font-bold text-blue-700 text-sm">{logged.carbs_g}g</div><div className="text-xs text-gray-500">carbs</div></div>
                          <div><div className="font-bold text-orange-600 text-sm">{logged.fat_g}g</div><div className="text-xs text-gray-500">fat</div></div>
                        </div>
                      </div>

                      {/* Log button */}
                      <button
                        onClick={() => handleLog(recipe)}
                        disabled={isLogging}
                        className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                      >
                        {isLogging ? 'Logging...' : didLog ? '✅ Logged!' : `Log to ${getMealSlot(recipe.name).charAt(0).toUpperCase() + getMealSlot(recipe.name).slice(1)}`}
                      </button>

                      {/* Delete */}
                      {!isConfirmingDelete ? (
                        <button
                          onClick={() => setConfirmDelete(recipe.name)}
                          className="w-full text-xs text-gray-500 hover:text-red-400 py-1 transition-colors"
                        >
                          Remove recipe
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="flex-1 border border-gray-200 text-gray-500 text-xs py-2 rounded-xl hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(recipe.name)}
                            disabled={isDeleting}
                            className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-2 rounded-xl font-semibold transition disabled:opacity-50"
                          >
                            {isDeleting ? 'Removing...' : 'Yes, remove'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </PlanGate>
  )
}
