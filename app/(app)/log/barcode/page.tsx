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

/** Returns local date string YYYY-MM-DD — avoids UTC off-by-one for US users logging at night */
function localDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  const [cameraStarted, setCameraStarted] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const [food, setFood] = useState<FoodData | null>(null)
  const [qty, setQty] = useState(100)
  const [unit, setUnit] = useState('g')
  const [mealSlot, setMealSlot] = useState('lunch')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scannedCode, setScannedCode] = useState<string>('')
  const [contrib, setContrib] = useState({ name: '', brand: '', calories: '', protein: '', carbs: '', fat: '', serving_size: '' })
  const [contributing, setContributing] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [showManual, setShowManual] = useState(false)

  // Detect platform for error messages
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

  // Hard fallback: if camera isn't open after 12s and no error shown,
  // the WebView is silently blocking it — show a clear message
  useEffect(() => {
    if (phase !== 'scanning' || !cameraStarted || cameraReady || error) return
    const id = setTimeout(() => {
      setCameraReady(prev => {
        if (!prev) {
          setError(isIOS
            ? 'Camera isn\'t opening. Go to iPhone Settings → Privacy & Security → Camera → Safari and make sure it\'s allowed. Then close Safari and try again.'
            : 'Camera isn\'t opening. Go to your phone\'s Settings → Apps → Chrome (or your browser) → Permissions → Camera and make sure it\'s allowed. Then reload the page.')
        }
        return prev
      })
    }, 12000)
    return () => clearTimeout(id)
  }, [phase, cameraStarted, cameraReady, error])

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
    if (!contrib.name || !contrib.calories || !contrib.serving_size) return
    if (Number(contrib.serving_size) <= 0) {
      setError('Serving size must be greater than 0 grams')
      return
    }
    setContributing(true)
    setError(null)
    // Convert per-serving → per-100g for storage
    const servingG = Number(contrib.serving_size)
    const factor = servingG > 0 ? 100 / servingG : 1
    const cal100 = Math.round(Number(contrib.calories) * factor * 10) / 10
    const pro100 = Math.round((Number(contrib.protein) || 0) * factor * 10) / 10
    const carb100 = Math.round((Number(contrib.carbs) || 0) * factor * 10) / 10
    const fat100 = Math.round((Number(contrib.fat) || 0) * factor * 10) / 10
    try {
      await fetch('/api/barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: scannedCode,
          name: contrib.name,
          brand: contrib.brand,
          calories_per_100g: cal100,
          protein_per_100g: pro100,
          carbs_per_100g: carb100,
          fat_per_100g: fat100,
          serving_size_g: servingG,
          added_by: user?.primaryEmailAddress?.emailAddress || '',
        }),
      })
      // Load the contributed product into result view
      const contributed: FoodData = {
        name: contrib.name,
        brand: contrib.brand,
        calories_per_100g: cal100,
        protein_per_100g: pro100,
        carbs_per_100g: carb100,
        fat_per_100g: fat100,
        serving_size_g: servingG,
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controlsRef.current) {
        try { controlsRef.current.stop() } catch {}
        controlsRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  // Called DIRECTLY from the tap button — iOS Safari requires getUserMedia
  // to be invoked synchronously within a user gesture, not via useEffect
  async function startCamera() {
    if (!videoRef.current) return
    setCameraStarted(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera not supported. Make sure you\'re using HTTPS.')
        return
      }

      const streamOrTimeout = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('CameraTimeout')), 8000)
        ),
      ])
      const stream = streamOrTimeout as MediaStream
      streamRef.current = stream

      const video = videoRef.current
      video.playsInline = true
      video.muted = true
      video.srcObject = stream

      try {
        await Promise.race([
          video.play(),
          new Promise<void>(resolve => setTimeout(resolve, 3000)),
        ])
      } catch { /* muted video autoplay — ignore */ }

      setCameraReady(true)

      // ── Strategy 1: Native BarcodeDetector (Chrome Android, Safari 17+) ──
      if ('BarcodeDetector' in window) {
        try {
          // @ts-ignore
          const supportedFormats: string[] = await window.BarcodeDetector.getSupportedFormats?.() ?? []
          // Use all supported formats, or fall back to common grocery barcode types
          const formats = supportedFormats.length > 0 ? supportedFormats :
            ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix']
          // @ts-ignore
          const detector = new window.BarcodeDetector({ formats })
          let active = true
          let rafId: number
          async function scan() {
            if (!active) return
            try {
              // @ts-ignore
              const barcodes = await detector.detect(video)
              if (barcodes.length > 0 && active) {
                active = false
                stream.getTracks().forEach(t => t.stop())
                lookupBarcode(barcodes[0].rawValue)
                return
              }
            } catch { /* no barcode this frame */ }
            rafId = requestAnimationFrame(scan)
          }
          rafId = requestAnimationFrame(scan)
          controlsRef.current = { stop: () => { active = false; cancelAnimationFrame(rafId); stream.getTracks().forEach(t => t.stop()) } }
          return
        } catch {
          // BarcodeDetector failed to initialize — fall through to ZXing
        }
      }

      // ── Strategy 2: ZXing fallback (iOS Safari) ──
      // @ts-ignore
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      let zxingActive = true
      const controls = await reader.decodeFromStream(
        stream,
        video,
        (result: any, _err: any, ctrl: any) => {
          if (!zxingActive || !result) return
          zxingActive = false
          ctrl.stop()
          controlsRef.current = null
          lookupBarcode(result.getText())
        }
      )
      controlsRef.current = { stop: () => { zxingActive = false; try { controls.stop() } catch {} } }

    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError(isIOS
          ? 'Camera access denied. Go to Settings → Safari → Camera and set it to Allow, then try again.'
          : 'Camera access denied. Go to your browser Settings → allow camera for this site, then reload.')
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is in use by another app. Close other apps and try again.')
      } else if (err.message === 'CameraTimeout') {
        setError(isIOS
          ? 'Camera took too long to open. Go to iPhone Settings → Privacy & Security → Camera → Safari, make sure it\'s enabled, then force-close Safari and try again.'
          : 'Camera took too long to open. Check your browser camera permissions and reload.')
      } else {
        setError('Camera not available. Please allow camera access and try again.')
      }
    }
  }

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
          date: localDateString(),
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.push('/log'); router.refresh()
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
            router.push('/log'); router.refresh()
          }}
          className="text-2xl leading-none"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">🔍 Scan Barcode</h1>
      </div>

      {/* Scanner view — always in DOM so video ref works */}
      <div className={`relative ${phase === 'scanning' ? 'flex-1' : 'hidden'} flex items-center justify-center bg-black`}>
        {/* playsInline + muted + autoPlay must be JSX props for iOS Safari to show video inline */}
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />

        {/* Tap to start — iOS Safari requires getUserMedia to be called from a user gesture */}
        {!cameraStarted && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-6">
            <p className="text-6xl mb-6">📷</p>
            <button
              onClick={startCamera}
              className="bg-green-500 hover:bg-green-600 text-white font-semibold px-8 py-4 rounded-2xl text-lg mb-4"
            >
              Tap to Start Scanner
            </button>
            {/* Manual barcode entry fallback */}
            {!showManual ? (
              <button
                onClick={() => setShowManual(true)}
                className="text-white/50 text-sm underline"
              >
                Type barcode number instead
              </button>
            ) : (
              <div className="w-full max-w-xs mt-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 0014100085676"
                    value={manualCode}
                    onChange={e => setManualCode(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                    autoFocus
                  />
                  <button
                    onClick={() => { if (manualCode.trim()) lookupBarcode(manualCode.trim()) }}
                    disabled={!manualCode.trim()}
                    className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-40"
                  >
                    Look up
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Waiting for camera overlay — shown until stream is live */}
        {cameraStarted && !cameraReady && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-white/70 text-sm">Opening camera…</p>
          </div>
        )}

        {cameraReady && (
          <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-36">
                <div className="absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
                <div className="absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
                <div className="absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
                <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
              </div>
            </div>
            {!showManual ? (
              <div className="absolute bottom-6 flex flex-col items-center gap-2 w-full px-6">
                <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-full">
                  Point camera at a barcode
                </p>
                <button
                  onClick={() => setShowManual(true)}
                  className="text-white/50 text-xs underline"
                >
                  Type barcode number instead
                </button>
              </div>
            ) : (
              <div className="absolute bottom-6 w-full px-6">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 0014100085676"
                    value={manualCode}
                    onChange={e => setManualCode(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    autoFocus
                  />
                  <button
                    onClick={() => { if (manualCode.trim()) { if (controlsRef.current) { try { controlsRef.current.stop() } catch {} } lookupBarcode(manualCode.trim()) } }}
                    disabled={!manualCode.trim()}
                    className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-40"
                  >
                    Look up
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-6 text-center">
            <p className="text-5xl mb-4">📷</p>
            <p className="text-white font-semibold mb-2">Camera Unavailable</p>
            <p className="text-white/70 text-sm mb-6">{error}</p>
            <button
              onClick={() => router.push('/log/new')}
              className="bg-white text-gray-900 font-semibold px-6 py-3 rounded-xl text-sm"
            >
              Enter food manually instead
            </button>
          </div>
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Chobani"
                  value={contrib.brand}
                  onChange={e => setContrib(p => ({ ...p, brand: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Serving Size (g) * <span className="font-normal text-gray-500">— check the label</span></label>
                <input
                  type="number"
                  placeholder="e.g. 170"
                  value={contrib.serving_size}
                  onChange={e => setContrib(p => ({ ...p, serving_size: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                  min={1}
                />
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Nutrition per serving (from the label)</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🔥 Calories *</label>
                  <input
                    type="number"
                    placeholder="e.g. 100"
                    value={contrib.calories}
                    onChange={e => setContrib(p => ({ ...p, calories: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">💪 Protein (g)</label>
                  <input
                    type="number"
                    placeholder="e.g. 17"
                    value={contrib.protein}
                    onChange={e => setContrib(p => ({ ...p, protein: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🌾 Carbs (g)</label>
                  <input
                    type="number"
                    placeholder="e.g. 6"
                    value={contrib.carbs}
                    onChange={e => setContrib(p => ({ ...p, carbs: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🥑 Fat (g)</label>
                  <input
                    type="number"
                    placeholder="e.g. 0"
                    value={contrib.fat}
                    onChange={e => setContrib(p => ({ ...p, fat: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                    min={0}
                  />
                </div>
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
                disabled={contributing || !contrib.name || !contrib.calories || !contrib.serving_size || Number(contrib.serving_size) <= 0 || Number(contrib.calories) <= 0}
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
                {food.brand && <p className="text-sm text-gray-500">{food.brand}</p>}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
                className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
                min={0}
              />
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value)
                  setQty(e.target.value === 'serving' ? 1 : 100)
                }}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-800"
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
              <label className="block text-xs font-medium text-gray-500 mb-2">Meal</label>
              <div className="grid grid-cols-2 gap-1">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMealSlot(s)}
                    className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                      mealSlot === s ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
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