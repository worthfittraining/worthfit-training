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

type Ingredient = { amount: string; unit: string; item: string }
type Recipe = { servings: string; prepTime: string; cookTime: string; ingredients: Ingredient[]; steps: string[]; tips: string }
type GroceryCategory = { name: string; items: string[] }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

type PageView = 'plan' | 'grocery' | 'test'

export default function MealPlanPage() {
  const { user } = useUser()
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedDay, setSelectedDay] = useState(0)
  const [pageView, setPageView] = useState<PageView>('plan')

  // Recipe modal
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeError, setRecipeError] = useState('')

  // Grocery list
  const [groceryList, setGroceryList] = useState<GroceryCategory[] | null>(null)
  const [groceryLoading, setGroceryLoading] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())

  // Macro tester
  const [testMeal, setTestMeal] = useState('')
  const [testResult, setTestResult] = useState<{ calories: number; protein_g: number; carbs_g: number; fat_g: number; fits: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [profile, setProfile] = useState<{ Calories?: number; Protein_g?: number; Carbs_g?: number; Fat_g?: number } | null>(null)

  useEffect(() => { fetchMealPlan(); fetchProfile() }, [user])

  async function fetchProfile() {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    try {
      const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      if (res.ok) setProfile(await res.json())
    } catch { /* ignore */ }
  }

  async function fetchMealPlan() {
    if (!user?.primaryEmailAddress?.emailAddress) return
    try {
      const res = await fetch(`/api/meal-plan?email=${encodeURIComponent(user.primaryEmailAddress!.emailAddress)}`)
      const data = await res.json()
      setMeals(Array.isArray(data) ? data : (data.meals || []))
    } catch (err) { console.error('Failed to fetch meal plan:', err) }
    finally { setLoading(false) }
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
      setMeals(Array.isArray(data) ? data : (data.meals || []))
      setGroceryList(null) // reset grocery list when plan changes
    } catch (err) { console.error(err); alert('Something went wrong. Please try again!') }
    finally { setGenerating(false) }
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
        body: JSON.stringify({ recipeName: String(meal.recipe_name || ''), calories: Number(meal.calories) || 0, protein_g: Number(meal.protein_g) || 0, carbs_g: Number(meal.carbs_g) || 0, fat_g: Number(meal.fat_g) || 0, email: user?.primaryEmailAddress?.emailAddress }),
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
    setPageView('grocery')
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

  async function testMealMacros() {
    if (!testMeal.trim()) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeName: testMeal, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, email: user?.primaryEmailAddress?.emailAddress, estimateOnly: true }),
      })
      // Actually use chat API for macro estimation
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.primaryEmailAddress?.emailAddress,
          mode: 'food_logger',
          messages: [{ role: 'user', content: `Estimate the macros for: ${testMeal}. Return ONLY JSON: {"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}` }],
        }),
      })
      const chatData = await chatRes.json()
      const text = chatData.content || ''
      const jsonMatch = text.match(/\{[^}]+\}/)
      if (jsonMatch) {
        const macros = JSON.parse(jsonMatch[0])
        const calTarget = profile?.Calories || 2000
        const protTarget = profile?.Protein_g || 150
        const pct = macros.calories / calTarget
        const fits = pct <= 0.35 ? '✅ Fits well into your day' : pct <= 0.5 ? '⚠️ Large meal — plan lighter options around it' : '🔴 Very high — consider a smaller portion'
        setTestResult({ ...macros, fits })
      }
    } catch (err) { console.error(err) }
    finally { setTestLoading(false) }
  }

  const dayMeals = meals.filter(m => String(m.day).toLowerCase() === DAYS[selectedDay].toLowerCase())
  const bySlot = MEAL_SLOTS.map(slot => ({ slot, meal: dayMeals.find(m => String(m.meal_slot).toLowerCase() === slot) })).filter(s => s.meal)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</a>
          <h1 className="text-lg font-bold text-gray-800">Meal Planner</h1>
          <button onClick={generateMealPlan} disabled={generating} className="bg-green-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors">
            {generating ? 'Generating...' : '✨ Generate Plan'}
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 mb-5">
          <button onClick={() => setPageView('plan')} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${pageView === 'plan' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>📋 This Week</button>
          <button onClick={() => setPageView('test')} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${pageView === 'test' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>🔬 Test a Meal</button>
          <button onClick={generateGroceryList} disabled={meals.length === 0} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${pageView === 'grocery' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700 disabled:opacity-40'}`}>🛒 Grocery List</button>
        </div>

        {/* PLAN VIEW */}
        {pageView === 'plan' && (
          <>
            <div className="flex gap-1 mb-6 bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
              {DAY_ABBREV.map((day, i) => (
                <button key={day} onClick={() => setSelectedDay(i)} className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors ${selectedDay === i ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>{day}</button>
              ))}
            </div>
            {loading ? <div className="text-center text-gray-400 py-12">Loading...</div>
              : generating ? <div className="text-center py-16"><div className="text-5xl mb-4">✨</div><p className="text-gray-600 font-medium">Nali is creating your meal plan...</p><p className="text-gray-400 text-sm mt-2">This takes about 15–20 seconds</p></div>
              : meals.length === 0 ? <div className="text-center py-16"><div className="text-5xl mb-4">📋</div><p className="text-gray-600 font-medium mb-2">No meal plan yet</p><p className="text-gray-400 text-sm">Click "✨ Generate Plan" and Nali will create a personalized week of meals!</p></div>
              : bySlot.length === 0 ? <div className="text-center py-12 text-gray-400 text-sm">No meals planned for {DAYS[selectedDay]}</div>
              : (
                <div className="space-y-3">
                  {bySlot.map(({ slot, meal }) => meal && (
                    <div key={slot} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:border-green-300 hover:shadow-md transition-all active:scale-[0.99]" onClick={() => openRecipe(meal)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1 capitalize">{slot}</div>
                          <div className="font-medium text-gray-800 mb-1">{String(meal.recipe_name || '')}</div>
                          {meal.notes ? <div className="text-xs text-gray-400 mb-2">{String(meal.notes)}</div> : null}
                          <div className="flex gap-3 text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">{Number(meal.calories) || 0} cal</span>
                            <span>{Number(meal.protein_g) || 0}g protein</span>
                            <span>{Number(meal.carbs_g) || 0}g carbs</span>
                            <span>{Number(meal.fat_g) || 0}g fat</span>
                          </div>
                        </div>
                        <div className="ml-3 text-green-500 text-lg">📖</div>
                      </div>
                      <div className="mt-3 text-xs text-green-600 font-medium">Tap for full recipe & ingredients →</div>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}

        {/* TEST A MEAL VIEW */}
        {pageView === 'test' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-800 mb-1">Test a Meal</h2>
              <p className="text-sm text-gray-500 mb-4">Enter any meal or food and see if it fits into your daily macros before you eat it.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testMeal}
                  onChange={e => setTestMeal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && testMealMacros()}
                  placeholder="e.g. Chipotle burrito bowl, 2 eggs and toast..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <button onClick={testMealMacros} disabled={testLoading || !testMeal.trim()} className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition">
                  {testLoading ? '...' : 'Check'}
                </button>
              </div>
            </div>

            {testResult && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <h3 className="font-semibold text-gray-800">Estimated Macros</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Calories', val: testResult.calories, target: profile?.Calories, color: 'text-orange-500' },
                    { label: 'Protein', val: `${testResult.protein_g}g`, target: profile?.Protein_g ? `${profile.Protein_g}g` : null, color: 'text-blue-500' },
                    { label: 'Carbs', val: `${testResult.carbs_g}g`, target: null, color: 'text-yellow-500' },
                    { label: 'Fat', val: `${testResult.fat_g}g`, target: null, color: 'text-green-500' },
                  ].map(m => (
                    <div key={m.label} className="bg-gray-50 rounded-xl p-2 text-center">
                      <p className={`text-lg font-bold ${m.color}`}>{m.val}</p>
                      <p className="text-xs text-gray-400">{m.label}</p>
                      {m.target && <p className="text-xs text-gray-300">/ {m.target}</p>}
                    </div>
                  ))}
                </div>
                <div className="bg-green-50 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">{testResult.fits}</div>
                <p className="text-xs text-gray-400">Estimates are approximate. Ask Nali in chat for more detailed guidance.</p>
              </div>
            )}

            {testLoading && (
              <div className="text-center py-8 text-gray-400 text-sm">Estimating macros...</div>
            )}
          </div>
        )}

        {/* GROCERY LIST VIEW */}
        {pageView === 'grocery' && (
          <div>
            {groceryLoading ? (
              <div className="text-center py-16"><div className="text-5xl mb-4">🛒</div><p className="text-gray-600 font-medium">Building your grocery list...</p></div>
            ) : groceryList ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Tap items to check them off as you shop</p>
                  <button onClick={() => setCheckedItems(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
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
                          <button key={i} onClick={() => setCheckedItems(prev => { const s = new Set(prev); checked ? s.delete(key) : s.add(key); return s })} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
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
              <div className="text-center py-16 text-gray-400">
                <p>Generate a meal plan first, then tap 🛒 Grocery List</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recipe Modal */}
      {selectedMeal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelectedMeal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white rounded-t-3xl border-b border-gray-100 px-5 py-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide capitalize mb-0.5">{String(selectedMeal.meal_slot || '')}</p>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">{String(selectedMeal.recipe_name || '')}</h2>
              </div>
              <button onClick={() => setSelectedMeal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-light ml-4 mt-1">✕</button>
            </div>
            <div className="p-5">
              {recipeLoading ? (
                <div className="text-center py-12"><div className="text-4xl mb-3">👩‍🍳</div><p className="text-gray-500 text-sm">Getting your recipe...</p></div>
              ) : recipeError ? (
                <div className="text-center py-8"><p className="text-red-400 text-sm mb-3">{recipeError}</p><button onClick={() => openRecipe(selectedMeal)} className="text-green-600 text-sm font-medium">Try again</button></div>
              ) : recipe ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-4 gap-2">
                    {[{ label: 'Calories', val: `${Number(selectedMeal.calories)||0}` }, { label: 'Protein', val: `${Number(selectedMeal.protein_g)||0}g` }, { label: 'Carbs', val: `${Number(selectedMeal.carbs_g)||0}g` }, { label: 'Fat', val: `${Number(selectedMeal.fat_g)||0}g` }].map(m => (
                      <div key={m.label} className="bg-green-50 rounded-xl p-2 text-center"><p className="text-sm font-bold text-gray-800">{m.val}</p><p className="text-xs text-gray-400">{m.label}</p></div>
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
                          <span className="shrink-0 w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{i+1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {recipe.tips && <div className="bg-yellow-50 rounded-xl p-3 text-sm text-yellow-800">💡 <strong>Tip:</strong> {recipe.tips}</div>}
                  <a href="/chat" className="block w-full text-center bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition text-sm">Log this meal with Nali →</a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
