'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import PlanGate from '@/app/components/PlanGate'

type NutritionEstimate = {
  food_name: string
  meal_slot: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  notes: string
  confidence: 'low' | 'medium' | 'high'
}

export default function PhotoLogPage() {
  const { user } = useUser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string>('image/jpeg')
  const [analyzing, setAnalyzing] = useState(false)
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editedEstimate, setEditedEstimate] = useState<NutritionEstimate | null>(null)

  function handleFile(file: File) {
    if (!file) return
    const type = file.type || 'image/jpeg'
    setMediaType(type)
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setImageBase64(base64)
      setPreview(result)
      setEstimate(null)
      setEditedEstimate(null)
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  async function analyzePhoto() {
    if (!imageBase64) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await fetch('/api/log/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Analysis failed')
      }
      const data: NutritionEstimate = await res.json()
      setEstimate(data)
      setEditedEstimate(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setAnalyzing(false)
    }
  }

  async function saveLog() {
    if (!editedEstimate || !user?.primaryEmailAddress?.emailAddress) return
    setSaving(true)
    try {
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.primaryEmailAddress.emailAddress,
          food_name: editedEstimate.food_name,
          calories: editedEstimate.calories,
          protein_g: editedEstimate.protein_g,
          carbs_g: editedEstimate.carbs_g,
          fat_g: editedEstimate.fat_g,
          meal_slot: editedEstimate.meal_slot,
          notes: `[Photo log] ${editedEstimate.notes}`,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.push('/log')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  const confidenceColor =
    estimate?.confidence === 'high'
      ? 'text-green-600'
      : estimate?.confidence === 'medium'
      ? 'text-yellow-600'
      : 'text-red-500'

  const confidenceLabel =
    estimate?.confidence === 'high'
      ? '✅ High confidence'
      : estimate?.confidence === 'medium'
      ? '⚠️ Medium confidence'
      : '⚠️ Low confidence — please review'

  return (
    <PlanGate feature="photoLog">
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/log')}
            className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold text-gray-800">📷 Photo Log</h1>
        </div>

        {!preview && (
          <div className="bg-white rounded-2xl shadow p-6 text-center">
            <div className="text-5xl mb-4">🍽️</div>
            <p className="text-gray-600 mb-6">
              Take a photo of your meal and Nali will estimate the macros for you.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="bg-green-500 text-white py-3 px-6 rounded-xl font-semibold text-lg hover:bg-green-600 transition"
              >
                📸 Take Photo
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-gray-200 text-gray-600 py-3 px-6 rounded-xl font-semibold text-lg hover:border-gray-400 transition"
              >
                🖼️ Upload from Library
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {preview && !estimate && (
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <img src={preview} alt="Meal preview" className="w-full max-h-64 object-cover" />
            <div className="p-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
                  {error}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setPreview(null); setImageBase64(null); setError(null) }}
                  className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:border-gray-400 transition"
                >
                  Retake
                </button>
                <button
                  onClick={analyzePhoto}
                  disabled={analyzing}
                  className="flex-grow bg-green-500 text-white py-3 px-6 rounded-xl font-semibold hover:bg-green-600 disabled:opacity-60 transition"
                >
                  {analyzing ? '🔍 Analyzing...' : '✨ Analyze with Nali'}
                </button>
              </div>
              {analyzing && (
                <p className="text-center text-sm text-gray-500 mt-3 animate-pulse">
                  Nali is examining your meal...
                </p>
              )}
            </div>
          </div>
        )}

        {preview && editedEstimate && (
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <img src={preview} alt="Meal" className="w-full max-h-48 object-cover" />
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">Nali&apos;s Estimate</h2>
                <span className={`text-sm font-medium ${confidenceColor}`}>{confidenceLabel}</span>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Food Name</label>
                <input
                  type="text"
                  value={editedEstimate.food_name}
                  onChange={(e) => setEditedEstimate({ ...editedEstimate, food_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Meal</label>
                <select
                  value={editedEstimate.meal_slot}
                  onChange={(e) => setEditedEstimate({ ...editedEstimate, meal_slot: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { key: 'calories', label: '🔥 Calories', unit: 'kcal', color: 'bg-orange-50 border-orange-200' },
                  { key: 'protein_g', label: '💪 Protein', unit: 'g', color: 'bg-blue-50 border-blue-200' },
                  { key: 'carbs_g', label: '🌾 Carbs', unit: 'g', color: 'bg-yellow-50 border-yellow-200' },
                  { key: 'fat_g', label: '🥑 Fat', unit: 'g', color: 'bg-green-50 border-green-200' },
                ].map(({ key, label, unit, color }) => (
                  <div key={key} className={`border rounded-xl p-3 ${color}`}>
                    <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={editedEstimate[key as keyof NutritionEstimate] as number}
                        onChange={(e) =>
                          setEditedEstimate({ ...editedEstimate, [key]: parseInt(e.target.value) || 0 })
                        }
                        className="w-full bg-transparent text-xl font-bold text-gray-800 focus:outline-none"
                        min={0}
                      />
                      <span className="text-sm text-gray-500">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              {estimate?.notes && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-1">Nali&apos;s Notes</p>
                  <p className="text-sm text-gray-600">{estimate.notes}</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setEstimate(null); setEditedEstimate(null); setPreview(null); setImageBase64(null) }}
                  className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:border-gray-400 transition"
                >
                  Retake
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
    </div>
    </PlanGate>
  )
}