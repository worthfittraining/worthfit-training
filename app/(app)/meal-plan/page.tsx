'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import PlanGate from '@/app/components/PlanGate'

type Meal = {
  id: string
  recipe_name: string
  day: string
  meal_slot: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  notes: string
}

type EditDraft = {
  recipe_name: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
  notes: string
}

type Profile = {
  Calories?: number
  Protein_g?: number
  Carbs_g?: number
  Fat_g?: number
  Meals_Per_Day?: number
  Plan?: string
}

type Questionnaire = {
  uniqueBreakfasts: number
  uniqueLunches: number
  uniqueDinners: number
  includeSnacks: boolean
  weekPreferences: string
}

type Ingredient = { amount: string; unit: string; item: string }
type Recipe = { servings: string; prepTime: string; cookTime: string; ingredients: Ingredient[]; steps: string[]; tips: string }
type GroceryCategory = { name: string; items: string[] }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

function normalizeMeals(raw: Record<string, unknown>[]): Meal[] {
  return raw.map(m => ({
    id: String(m.id || ''),
    recipe_name: String(m.recipe_name || ''),
    day: String(m.day || ''),
    meal_slot: String(m.meal_slot || ''),
    calories: Number(m.calories) || 0,
    protein_g: Number(m.protein_g) || 0,
    carbs_g: Number(m.carbs_g) || 0,
    fat_g: Number(m.fat_g) || 0,
    notes: String(m.notes || ''),
  }))
}

function MacroBar({ value, target, label, color }: { value: number; target: number; label: string; color: string }) {
  const pct = target ? Math.min(value / target, 1) : 0
  const over = target && value > target * 1.1
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className={`font-semibold ${over ? 'text-purple-600' : 'text-gray-700'}`}>
          {value}{label !== 'Cal' ? 'g' : ''}{target ? ` / ${target}${label !== 'Cal' ? 'g' : ''}` : ''}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${over ? 'bg-purple-400' : color}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  )
}

export default function MealPlanPage() {
  const { user } = useUser()

  // Core state
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedDay, setSelectedDay] = useState(0)
  const [pageView, setPageView] = useState<'plan' | 'grocery'>('plan')

  // Profile + plan tier
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userPlan, setUserPlan] = useState<string>('free')

  // Questionnaire modal
  const [showQuestionnaire, setShowQuestionnaire] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>({
    uniqueBreakfasts: 2,
    uniqueLunches: 3,
    uniqueDinners: 5,
    includeSnacks: false,
    weekPreferences: '',
  })

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Recipe modal
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeError, setRecipeError] = useState('')

  // Grocery list
  const [groceryList, setGroceryList] = useState<GroceryCategory[] | null>(null)
  const [groceryLoading, setGroceryLoading] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())

  useEffect(() => { if (user) { fetchProfile(); fetchMealPlan() } }, [user])

  async function fetchProfile() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    try {
      const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        setUserPlan(data.Plan || 'free')
        if (Number(data.Meals_Per_Day) >= 4) {
          setQuestionnaire(q => ({ ...q, includeSnacks: true }))
        }
      }
    } catch { /* ignore */ }
  }

  async function fetchMealPlan() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    try {
      const res = await fetch(`/api/meal-plan?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setMeals(normalizeMeals(Array.isArray(data) ? data : (data.meals || [])))
    } catch (err) { console.error('Failed to fetch meal plan:', err) }
    finally { setLoading(false) }
  }

  async function generateMealPlan() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    setGenerating(true)
    setShowQuestionnaire(false)
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...questionnaire }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMeals(normalizeMeals(Array.isArray(data) ? data : (data.meals || [])))
      setGroceryList(null)
      setPageView('plan')
    } catch (err) { console.error(err); alert('Something went wrong. Please try again!') }
    finally { setGenerating(false) }
  }

  function startEdit(meal: Meal) {
    setEditingId(meal.id)
    setEditDraft({
      recipe_name: meal.recipe_name,
      calories: String(meal.calories),
      protein_g: String(meal.protein_g),
      carbs_g: String(meal.carbs_g),
      fat_g: String(meal.fat_g),
      notes: meal.notes,
    })
  }

  async function saveEdit(mealId: string) {
    if (!editDraft) return
    setSavingEdit(true)
    try {
      const updated = {
        recipe_name: editDraft.recipe_name,
        calories: Number(editDraft.calories) || 0,
        protein_g: Number(editDraft.protein_g) || 0,
        carbs_g: Number(editDraft.carbs_g) || 0,
        fat_g: Number(editDraft.fat_g) || 0,
        notes: editDraft.notes,
      }
      const res = await fetch('/api/meal-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mealId, ...updated }),
      })
      if (res.ok) {
        setMeals(prev => prev.map(m => m.id === mealId ? { ...m, ...updated } : m))
        setEditingId(null)
        setEditDraft(null)
      } else {
        alert('Failed to save. Please try again.')
      }
    } catch (err) { console.error(err); alert('Something went wrong.') }
    finally { setSavingEdit(false) }
  }

  async function openRecipe(meal: Meal) {
    setSelectedMeal(meal)
    setRecipe(null)
    setRecipeError('')
    setRecipeLoading(true)
    try {
      const res = await fetch('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeName: meal.recipe_name, calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g, email: user?.primaryEmailAddress?.emailAddress }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRecipe(data.recipe)
    } catch (err) { setRecipeError('Could not load recipe. Please try again.'); console.error(err) }
    finally { setRecipeLoading(false) }
  }

  async function generateGroceryList() {
    if (meals.length === 0) return
    setGroceryLoading(true)
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meals }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setGroceryList(data.groceryList.categories || [])
    } catch (err) { console.error(err); alert('Could not generate grocery list.') }
    finally { setGroceryLoading(false) }
  }

  // Computed
  const dayMeals = meals.filter(m => m.day.toLowerCase() === DAYS[selectedDay].toLowerCase())
  const bySlot = MEAL_SLOTS
    .map(slot => ({ slot, meal: dayMeals.find(m => m.meal_slot.toLowerCase() === slot) }))
    .filter(s => s.meal)
  const dayTotals = {
    calories: dayMeals.reduce((s, m) => s + m.calories, 0),
    protein_g: dayMeals.reduce((s, m) => s + m.protein_g, 0),
    carbs_g: dayMeals.reduce((s, m) => s + m.carbs_g, 0),
    fat_g: dayMeals.reduce((s, m) => s + m.fat_g, 0),
  }
  const isPremium = userPlan === 'premium'

  return (
    <PlanGate feature="mealPlan">
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</a>
          <h1 className="text-lg font-bold text-gray-800">Meal Planner</h1>
          <button
            onClick={() => setShowQuestionnaire(true)}
            disabled={generating}
            className="bg-green-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors"
          >
            {generating ? 'Generating...' : meals.length > 0 ? '↺ Regenerate' : '✨ Generate'}
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-5">
          <button onClick={() => setPageView('plan')} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${pageView === 'plan' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            📋 This Week
          </button>
          <button onClick={() => setPageView('grocery')} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${pageView === 'grocery' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            🛒 Grocery List {!isPremium && '🔒'}
          </button>
        </div>

        {/* ── PLAN VIEW ── */}
        {pageView === 'plan' && (
          <>
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
                <p className="text-gray-400 text-sm mb-6">Click "✨ Generate" and Nali will create a personalized week of meals based on your goals.</p>
                <button onClick={() => setShowQuestionnaire(true)} className="bg-green-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-green-600 transition">
                  ✨ Generate My Meal Plan
                </button>
              </div>
            ) : (
              <>
                {/* Day selector */}
                <div className="flex gap-1 mb-4 bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
                  {DAY_ABBREV.map((day, i) => (
                    <button key={day} onClick={() => setSelectedDay(i)}
                      className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors ${selectedDay === i ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                      {day}
                    </button>
                  ))}
                </div>

                {/* Meal cards */}
                {bySlot.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">No meals planned for {DAYS[selectedDay]}</div>
                ) : (
                  <div className="space-y-3">
                    {bySlot.map(({ slot, meal }) => meal && (
                      <div key={`${meal.id}-${slot}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {editingId === meal.id && editDraft ? (
                          /* ── EDIT MODE ── */
                          <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-green-600 uppercase tracking-wide capitalize">{slot}</span>
                              <button onClick={() => { setEditingId(null); setEditDraft(null) }} className="text-gray-400 text-xs hover:text-gray-600">Cancel</button>
                            </div>
                            <input
                              value={editDraft.recipe_name}
                              onChange={e => setEditDraft(d => d ? { ...d, recipe_name: e.target.value } : d)}
                              placeholder="Meal name"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <div className="grid grid-cols-4 gap-2">
                              {(['calories', 'protein_g', 'carbs_g', 'fat_g'] as const).map((field) => (
                                <div key={field}>
                                  <label className="text-xs text-gray-400 block mb-1 capitalize">
                                    {field === 'calories' ? 'Cal' : field === 'protein_g' ? 'Protein' : field === 'carbs_g' ? 'Carbs' : 'Fat'}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={editDraft[field]}
                                    onChange={e => setEditDraft(d => d ? { ...d, [field]: e.target.value } : d)}
                                    className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                                  />
                                </div>
                              ))}
                            </div>
                            <input
                              value={editDraft.notes}
                              onChange={e => setEditDraft(d => d ? { ...d, notes: e.target.value } : d)}
                              placeholder="Notes (optional)"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <button
                              onClick={() => saveEdit(meal.id)}
                              disabled={savingEdit || !editDraft.recipe_name.trim()}
                              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                            >
                              {savingEdit ? 'Saving...' : '✓ Save Changes'}
                            </button>
                          </div>
                        ) : (
                          /* ── DISPLAY MODE ── */
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1 capitalize">{slot}</div>
                                <div className="font-medium text-gray-800 leading-snug">{meal.recipe_name}</div>
                                {meal.notes && <div className="text-xs text-gray-400 mt-1">{meal.notes}</div>}
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  onClick={() => startEdit(meal)}
                                  className="text-xs text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => openRecipe(meal)}
                                  className="text-xs text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  📖 Recipe
                                </button>
                              </div>
                            </div>
                            <div className="flex gap-3 text-xs text-gray-500">
                              <span className="font-semibold text-gray-700">{meal.calories} cal</span>
                              <span>{meal.protein_g}g protein</span>
                              <span>{meal.carbs_g}g carbs</span>
                              <span>{meal.fat_g}g fat</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Daily macro totals */}
                {dayMeals.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{DAYS[selectedDay]} Totals</p>
                    <div className="flex gap-3">
                      <MacroBar value={dayTotals.calories} target={profile?.Calories || 0} label="Cal" color="bg-orange-400" />
                      <MacroBar value={dayTotals.protein_g} target={profile?.Protein_g || 0} label="Prot" color="bg-blue-400" />
                      <MacroBar value={dayTotals.carbs_g} target={profile?.Carbs_g || 0} label="Carbs" color="bg-yellow-400" />
                      <MacroBar value={dayTotals.fat_g} target={profile?.Fat_g || 0} label="Fat" color="bg-green-400" />
                    </div>
                    {profile?.Calories && dayTotals.calories > 0 && (
                      <p className="text-xs text-gray-400 mt-2 text-center">
                        {dayTotals.calories < (profile.Calories || 0) * 0.9
                          ? `${(profile.Calories || 0) - dayTotals.calories} cal remaining`
                          : dayTotals.calories > (profile.Calories || 0) * 1.1
                          ? `${dayTotals.calories - (profile.Calories || 0)} cal over target`
                          : '✅ On target for the day'}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── GROCERY LIST VIEW ── */}
        {pageView === 'grocery' && (
          <>
            {!isPremium ? (
              /* Premium upgrade prompt */
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                <div className="text-4xl mb-3">🛒</div>
                <h2 className="font-bold text-gray-800 text-lg mb-2">Grocery List is a Premium Feature</h2>
                <p className="text-gray-500 text-sm mb-6">Generate a full shopping list from your weekly meal plan, organized by store section. Upgrade to Premium to unlock it.</p>
                <a href="/subscribe" className="inline-block bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
                  Upgrade to Premium →
                </a>
                <p className="text-xs text-gray-400 mt-3">Already on Standard? Your meal plan, editing, and macro tracking are all included.</p>
              </div>
            ) : meals.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-sm">Generate a meal plan first, then come back here to build your grocery list.</p>
              </div>
            ) : groceryLoading ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🛒</div>
                <p className="text-gray-600 font-medium">Building your grocery list...</p>
                <p className="text-gray-400 text-sm mt-2">Combining all meals for the week</p>
              </div>
            ) : groceryList ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Tap items to check them off as you shop</p>
                  <div className="flex gap-3">
                    <button onClick={() => setCheckedItems(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
                    <button onClick={() => { setGroceryList(null); generateGroceryList() }} className="text-xs text-green-600 hover:text-green-700">↺ Refresh</button>
                  </div>
                </div>
                {groceryList.map(cat => (
                  <div key={cat.name} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b">
                      <h3 className="font-semibold text-gray-700 text-sm">{cat.name}</h3>
                    </div>
                    <div className="divide-y">
                      {cat.items.map((item, i) => {
                        const key = `${cat.name}-${i}`
                        const checked = checkedItems.has(key)
                        return (
                          <button key={i} onClick={() => setCheckedItems(prev => { const s = new Set(prev); checked ? s.delete(key) : s.add(key); return s })}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                              {checked && <span className="text-white text-xs">✓</span>}
                            </div>
                            <span className={`text-sm ${checked ? 'line-through text-gray-300' : 'text-gray-700'}`}>{item}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">🛒</div>
                <p className="text-gray-600 font-medium mb-2">Ready to shop?</p>
                <p className="text-gray-400 text-sm mb-6">Generate a shopping list from your entire week of meals, organized by section.</p>
                <button onClick={generateGroceryList} className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
                  Build Grocery List
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── QUESTIONNAIRE MODAL ── */}
      {showQuestionnaire && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowQuestionnaire(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Plan your week 📋</h2>
              <p className="text-sm text-gray-500 mt-0.5">Tell Nali how you want to eat this week</p>
            </div>
            <div className="p-5 space-y-5">
              {/* Unique meals selectors */}
              {([
                { label: 'Breakfasts', key: 'uniqueBreakfasts' as const },
                { label: 'Lunches', key: 'uniqueLunches' as const },
                { label: 'Dinners', key: 'uniqueDinners' as const },
              ]).map(({ label, key }) => (
                <div key={key}>
                  <div className="flex justify-between items-baseline mb-2">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    <span className="text-xs text-gray-400">
                      {questionnaire[key] === 1 ? 'Same every day' : questionnaire[key] === 7 ? 'Different each day' : `${questionnaire[key]} different options`}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <button
                        key={n}
                        onClick={() => setQuestionnaire(q => ({ ...q, [key]: n }))}
                        className={`flex-1 h-9 rounded-xl text-sm font-semibold transition-colors ${questionnaire[key] === n ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-300 mt-1">1 = same all week · 7 = different every day</p>
                </div>
              ))}

              {/* Snacks toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Include snacks?</p>
                  <p className="text-xs text-gray-400">Add a snack option to each day</p>
                </div>
                <button
                  onClick={() => setQuestionnaire(q => ({ ...q, includeSnacks: !q.includeSnacks }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${questionnaire.includeSnacks ? 'bg-green-500' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${questionnaire.includeSnacks ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Free-text preferences */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Anything specific this week? <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={questionnaire.weekPreferences}
                  onChange={e => setQuestionnaire(q => ({ ...q, weekPreferences: e.target.value }))}
                  placeholder="e.g. more chicken this week, keep it simple, avoid pasta..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none placeholder:text-gray-400"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowQuestionnaire(false)} className="flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm">
                  Cancel
                </button>
                <button onClick={generateMealPlan} className="flex-2 flex-grow py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors text-sm">
                  ✨ Generate Plan →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RECIPE MODAL ── */}
      {selectedMeal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelectedMeal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white rounded-t-3xl border-b border-gray-100 px-5 py-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide capitalize mb-0.5">{selectedMeal.meal_slot}</p>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedMeal.recipe_name}</h2>
              </div>
              <button onClick={() => setSelectedMeal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-light ml-4 mt-1">✕</button>
            </div>
            <div className="p-5">
              {recipeLoading ? (
                <div className="text-center py-12"><div className="text-4xl mb-3">👩‍🍳</div><p className="text-gray-500 text-sm">Getting your recipe...</p></div>
              ) : recipeError ? (
                <div className="text-center py-8">
                  <p className="text-red-400 text-sm mb-3">{recipeError}</p>
                  <button onClick={() => openRecipe(selectedMeal)} className="text-green-600 text-sm font-medium">Try again</button>
                </div>
              ) : recipe ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-4 gap-2">
                    {[{ label: 'Calories', val: `${selectedMeal.calories}` }, { label: 'Protein', val: `${selectedMeal.protein_g}g` }, { label: 'Carbs', val: `${selectedMeal.carbs_g}g` }, { label: 'Fat', val: `${selectedMeal.fat_g}g` }].map(m => (
                      <div key={m.label} className="bg-green-50 rounded-xl p-2 text-center">
                        <p className="text-sm font-bold text-gray-800">{m.val}</p>
                        <p className="text-xs text-gray-400">{m.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>⏱ Prep: {recipe.prepTime}</span>
                    <span>🔥 Cook: {recipe.cookTime}</span>
                    <span>🍽 {recipe.servings}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Ingredients</h3>
                    <ul className="space-y-1.5">
                      {recipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full shrink-0" />
                          <span className="font-medium text-gray-800">{ing.amount} {ing.unit}</span>
                          <span>{ing.item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Instructions</h3>
                    <ol className="space-y-2">
                      {recipe.steps.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm text-gray-600">
                          <span className="shrink-0 w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {recipe.tips && <div className="bg-yellow-50 rounded-xl p-3 text-sm text-yellow-800">💡 <strong>Tip:</strong> {recipe.tips}</div>}
                  <a href="/chat" className="block w-full text-center bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition text-sm">
                    Log this meal with Nali →
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
    </PlanGate>
  )
}
