'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import PlanGate from '@/app/components/PlanGate'

type FoodData = {
  name: string
  brand: string
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  serving_size_g: number | null
  image_url: string | null
}

type Phase = 'scanning' | 'loading' | 'result' | 'notfound' | 'contributing' | 'submitted'

const UNITS = ['g', 'oz', 'cup', 'tbsp', 'tsp', 'serving']

function calcMacros(food: FoodData, qty: number, unit: string) {
  let grams = qty
  if (unit === 'oz') grams = qty * 28.35
  else if (unit === 'cup') grams = qty * 240
  else if (unit === 'tbsp') grams = qty * 15
  else if (unit === 'tsp') grams = qty * 5
  // multiply by qty so changing from 1 serving to 2 actually updates the macros
  else if (unit === 'serving') grams = (food.serving_size_g || 100) * qty
  const factor = grams / 100
  return {
    calories: Math.round(food.calories_per_100g * factor),
    protein_g: Math.round(food.protein_per_100g * factor * 10) / 10,
    carbs_g: Math.round(food.carbs_per_100g * factor * 10) / 10,
    fat_g: Math.round(food.fat_per_100g * factor * 10) / 10,
  }
}

export default function BarcodePage() {
  const { user } = useUser()
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<any>(null)

  const [phase, setPhase] = useState<Phase>('scanning')
  const [food, setFood] = useState<FoodData | null>(null)
  const [qty, setQty] = useState(100)
  const [unit, setUnit] = useState('g')
  const [mealSlot, setMealSlot] = useState('lunch')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scannedCode, setScannedCode] = useState<string>('')
  const [contrib, setContrib] = useState({ name: '', brand: '', calories: '', protein: '', carbs: '', fat: '', serving_size: '' })
  const [contributing, setContributing] = useState(false)

  async function lookupBarcode(barcode: string) {
    setPhase('loading')
    setScannedCode(barcode)
    try {
      const res = await fetch(`/api/barcode?code=${barcode}`)
      if (res.status === 404) { setPhase('notfound'); return }
      const data: FoodData = await res.json()
      setFood(data)
      if (data.serving_size_g) { setUnit('serving'); setQty(1) }
      setPhase('result')
    } catch {
      setError('Failed to look up product')
      setPhase('scanning')
    }
  }

  async function submitContribution() {
    if (!contrib.name || !contrib.calories) return
    setContributing(true)
    try {
      await fetch('/api/barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: scannedCode,
          name: contrib.name,
          brand: contrib.brand,
          calories_per_100g: Number(contrib.calories),
          protein_per_100g: Number(contrib.protein) || 0,
          carbs_per_100g: Number(contrib.carbs) || 0,
          fat_per_100g: Number(contrib.fat) || 0,
          serving_size_g: contrib.serving_size ? Number(contrib.serving_size) : null,
          added_by: user?.primaryEmailAddress?.emailAddress || '',
        }),
      })
      // Load the contributed product into result view
      const contributed: FoodData = {
        name: contrib.name,
        brand: contrib.brand,
        calories_per_100g: Number(contrib.calories),
        protein_per_100g: Number(contrib.protein) || 0,
        carbs_per_100g: Number(contrib.carbs) || 0,
        fat_per_100g: Number(contrib.fat) || 0,
        serving_size_g: contrib.serving_size ? Number(contrib.serving_size) : null,
        image_url: null,
      }
      setFood(contributed)
      if (contributed.serving_size_g) { setUnit('serving'); setQty(1) } else { setUnit('g'); setQty(100) }
      setPhase('submitted')
    } catch {
      setError('Failed to save product')
    } finally {
      setContributing(false)
    }
  }

  useEffect(() => {
    let active = true

    async function startScanner() {
      if (!videoRef.current) return
      try {
        // @ts-ignore
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        const deviceId: string | undefined = devices.length > 1 ? devices[devices.length - 1].deviceId : undefined

        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result: any, _err: any, ctrl: any) => {
            if (!active || !result) return
            ctrl.stop()
            controlsRef.current = null
            lookupBarcode(result.getText())
          }
        )

        if (active) {
          controlsRef.current = controls
        } else {
          controls.stop()
        }
      } catch {
        if (active) setError('Camera not available. Please allow camera access.')
      }
    }

    startScanner()

    return () => {
      active = false
      if (controlsRef.current) {
        try { controlsRef.current.stop() } catch {}
        controlsRef.current = null
      }
    }
  }, [])

  async function saveLog() {
    if (!food || !user?.primaryEmailAddress?.emailAddress) return
    const macros = calcMacros(food, qty, unit)
    setSaving(true)
    try {
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.primaryEmailAddress.emailAddress,
          food_name: food.name,
          ...macros,
          meal_slot: mealSlot,
          notes: `${qty} ${unit}${food.brand ? ` · ${food.brand}` : ''}`,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.push('/log')
    } catch {
      setError('Failed to save')
      setSaving(false)
    }
  }

  const macros = food ? calcMacros(food, qty, unit) : null

  return (
    <PlanGate feature="barcode">
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="flex items-center gap-3 p-4 text-white">
        <button
          onClick={() => {
            if (controlsRef.current) { try { controlsRef.current.stop() } catch {} }
            router.push('/log')
          }}
          className="text-2xl leading-none"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">🔍 Scan Barcode</h1>
      </div>

      {/* Scanner view — always in DOM so video ref works */}
      <div className={`relative ${phase === 'scanning' ? 'flex-1' : 'hidden'} flex items-center justify-center bg-black`}>
        <video ref={videoRef} className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-72 h-36">
            <div className="absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
            <div className="absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
            <div className="absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
            <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
          </div>
        </div>
        <p className="absolute bottom-8 text-white text-sm bg-black/50 px-4 py-2 rounded-full">
          Point camera at a barcode
        </p>
        {error && (
          <p className="absolute top-4 left-4 right-4 text-center bg-red-500 text-white text-sm py-2 px-4 rounded-lg">
            {error}
          </p>
        )}
      </div>

      {phase === 'loading' && (
        <div className="flex-1 flex flex-col items-center justify-center bg-white">
          <p className="text-4xl mb-4 animate-bounce">🔍</p>
          <p className="text-gray-500">Looking up product...</p>
        </div>
      )}

      {phase === 'notfound' && (
        <div className="flex-1 bg-white overflow-y-auto">
          <div className="p-5">
            <div className="text-center mb-5">
              <p className="text-4xl mb-2">🤷</p>
              <h2 className="text-xl font-bold text-gray-800">Product Not Found</h2>
              <p className="text-sm text-gray-500 mt-1">Help us grow the database! Add this product and it&apos;ll be available for everyone.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Product Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Greek Yogurt Vanilla"
                  value={contrib.name}
                  onChange={e => setContrib(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Chobani"
                  value={contrib.brand}
                  onChange={e => setContrib(p => ({ ...p, brand: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Nutrition per 100g</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🔥 Calories *</label>
                  <input
                    type="number"
                    placeholder="e.g. 59"
                    value={contrib.calories}
                    onChange={e => setContrib(p => ({ ...p, calories: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">💪 Protein (g)</label>
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    value={contrib.protein}
                    onChange={e => setContrib(p => ({ ...p, protein: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🌾 Carbs (g)</label>
                  <input
                    type="number"
                    placeholder="e.g. 3.6"
                    value={contrib.carbs}
                    onChange={e => setContrib(p => ({ ...p, carbs: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🥑 Fat (g)</label>
                  <input
                    type="number"
                    placeholder="e.g. 0.4"
                    value={contrib.fat}
                    onChange={e => setContrib(p => ({ ...p, fat: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    min={0}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Serving Size (g) — optional</label>
                <input
                  type="number"
                  placeholder="e.g. 170"
                  value={contrib.serving_size}
                  onChange={e => setContrib(p => ({ ...p, serving_size: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  min={0}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mt-3 text-sm">{error}</div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => router.push('/log/barcode')}
                className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl font-semibold text-sm"
              >
                Scan Again
              </button>
              <button
                onClick={submitContribution}
                disabled={contributing || !contrib.name || !contrib.calories}
                className="flex-grow bg-green-500 text-white py-3 px-5 rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {contributing ? 'Saving...' : '✅ Add & Log It'}
              </button>
            </div>
            <button onClick={() => router.push('/log/new')} className="w-full text-center text-blue-500 underline text-sm mt-3">
              Skip — enter manually instead
            </button>
          </div>
        </div>
      )}

      {(phase === 'result' || phase === 'submitted') && food && macros && (
        <div className="flex-1 bg-white overflow-y-auto">
          <div className="p-4">
            {phase === 'submitted' && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-4 text-sm font-medium text-center">
                🎉 Thanks for adding this product! It&apos;s now in the community database.
              </div>
            )}
            <div className="flex gap-3 items-center mb-5">
              {food.image_url && (
                <img src={food.image_url} alt={food.name} className="w-16 h-16 rounded-xl object-cover border border-gray-100" />
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-800 leading-tight">{food.name}</h2>
                {food.brand && <p className="text-sm text-gray-400">{food.brand}</p>}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
                className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-400"
                min={0}
              />
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value)
                  setQty(e.target.value === 'serving' ? 1 : 100)
                }}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u} disabled={u === 'serving' && !food.serving_size_g}>
                    {u}{u === 'serving' && food.serving_size_g ? ` (${food.serving_size_g}g)` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: '🔥 Calories', value: macros.calories, unit: 'kcal', color: 'bg-orange-50 border-orange-200' },
                { label: '💪 Protein', value: macros.protein_g, unit: 'g', color: 'bg-blue-50 border-blue-200' },
                { label: '🌾 Carbs', value: macros.carbs_g, unit: 'g', color: 'bg-yellow-50 border-yellow-200' },
                { label: '🥑 Fat', value: macros.fat_g, unit: 'g', color: 'bg-green-50 border-green-200' },
              ].map(({ label, value, unit, color }) => (
                <div key={label} className={`border rounded-xl p-3 ${color}`}>
                  <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                  <p className="text-xl font-bold text-gray-800">
                    {value} <span className="text-sm text-gray-500">{unit}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-500 mb-1">Meal</label>
              <select
                value={mealSlot}
                onChange={(e) => setMealSlot(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => router.push('/log/barcode')}
                className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:border-gray-400 transition"
              >
                Scan Again
              </button>
              <button
                onClick={saveLog}
                disabled={saving}
                className="flex-grow bg-green-500 text-white py-3 px-6 rounded-xl font-semibold hover:bg-green-600 disabled:opacity-60 transition"
              >
                {saving ? 'Saving...' : '✅ Save to Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PlanGate>
  )
}