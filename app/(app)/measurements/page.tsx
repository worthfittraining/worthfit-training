'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import PlanGate from '@/app/components/PlanGate'

type Measurement = {
  id: string
  date: string
  weight_lbs: number | null
  waist_in: number | null
  hips_in: number | null
  chest_in: number | null
  arms_in: number | null
  thighs_in: number | null
  notes: string
}

type MetricKey = 'weight_lbs' | 'waist_in' | 'hips_in' | 'chest_in' | 'arms_in' | 'thighs_in'

const METRIC_LABELS: Record<MetricKey, string> = {
  weight_lbs: 'Weight (lbs)',
  waist_in: 'Waist (in)',
  hips_in: 'Hips (in)',
  chest_in: 'Chest (in)',
  arms_in: 'Arms (in)',
  thighs_in: 'Thighs (in)',
}

const METRIC_COLORS: Record<MetricKey, string> = {
  weight_lbs: '#10b981',
  waist_in: '#3b82f6',
  hips_in: '#f59e0b',
  chest_in: '#ec4899',
  arms_in: '#8b5cf6',
  thighs_in: '#ef4444',
}

/** Returns local date string YYYY-MM-DD */
function localDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`
}

/** Simple SVG sparkline chart */
function SparklineChart({ data, color }: { data: { date: string; value: number }[]; color: string }) {
  if (data.length < 2) return null
  const W = 300, H = 80, PAD = 8
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - (d.value - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  const firstVal = values[0]
  const lastVal = values[values.length - 1]
  const diff = lastVal - firstVal
  const diffLabel = diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`
  const diffColor = diff < 0 ? 'text-green-600' : diff > 0 ? 'text-red-500' : 'text-gray-500'

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {data.map((d, i) => {
          const [x, y] = pts[i].split(',').map(Number)
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />
        })}
      </svg>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-gray-500">{formatDate(data[0].date)}</span>
        <span className={`font-semibold ${diffColor}`}>{diffLabel}</span>
        <span className="text-gray-500">{formatDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  date: localDateString(),
  weight_lbs: '',
  waist_in: '',
  hips_in: '',
  chest_in: '',
  arms_in: '',
  thighs_in: '',
  notes: '',
}

export default function MeasurementsPage() {
  const { user } = useUser()
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [activeMetric, setActiveMetric] = useState<MetricKey>('weight_lbs')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const email = user?.primaryEmailAddress?.emailAddress

  useEffect(() => {
    if (email) fetchMeasurements()
  }, [email])

  async function fetchMeasurements() {
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch(`/api/measurements?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        setMeasurements(Array.isArray(data) ? data : [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function saveMeasurement() {
    if (!email) return
    // Require at least one measurement value
    const hasValue = ['weight_lbs', 'waist_in', 'hips_in', 'chest_in', 'arms_in', 'thighs_in']
      .some(k => form[k as keyof typeof form] !== '')
    if (!hasValue) {
      setError('Enter at least one measurement.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...form }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setShowForm(false)
      setForm({ ...EMPTY_FORM, date: localDateString() })
      setSuccessMsg('Measurement saved! ✅')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchMeasurements()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteMeasurement(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/measurements?id=${id}`, { method: 'DELETE' })
      setMeasurements(prev => prev.filter(m => m.id !== id))
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }

  // Chart data for active metric
  const chartData = measurements
    .filter(m => m[activeMetric] != null)
    .map(m => ({ date: m.date, value: m[activeMetric] as number }))

  // Latest values
  const latest = measurements[measurements.length - 1]

  return (
    <PlanGate feature="measurements">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</a>
            <h1 className="text-lg font-bold text-gray-800">📏 Progress Tracking</h1>
            <button
              onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, date: localDateString() }) }}
              className="bg-green-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors"
            >
              + Log
            </button>
          </div>

          {successMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-2.5 text-sm mb-4 text-center">
              {successMsg}
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-500 py-16">Loading...</div>
          ) : measurements.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📏</div>
              <p className="text-gray-600 font-medium mb-2">No measurements yet</p>
              <p className="text-gray-500 text-sm mb-6">Track your weight and body measurements over time to see your progress.</p>
              <button
                onClick={() => setShowForm(true)}
                className="bg-green-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-green-600 transition"
              >
                + Log First Measurement
              </button>
            </div>
          ) : (
            <>
              {/* Latest snapshot */}
              {latest && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Latest — {formatDate(latest.date)}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(Object.keys(METRIC_LABELS) as MetricKey[]).map(key => {
                      const val = latest[key]
                      if (val == null) return null
                      return (
                        <div key={key} className="text-center">
                          <p className="text-lg font-bold text-gray-800">{val}</p>
                          <p className="text-xs text-gray-500">{METRIC_LABELS[key]}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Chart */}
              {chartData.length >= 2 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
                  <div className="flex gap-1.5 flex-wrap mb-4">
                    {(Object.keys(METRIC_LABELS) as MetricKey[]).map(key => {
                      const hasData = measurements.some(m => m[key] != null)
                      if (!hasData) return null
                      return (
                        <button
                          key={key}
                          onClick={() => setActiveMetric(key)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            activeMetric === key
                              ? 'text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                          style={activeMetric === key ? { backgroundColor: METRIC_COLORS[key] } : {}}
                        >
                          {METRIC_LABELS[key]}
                        </button>
                      )
                    })}
                  </div>
                  <SparklineChart data={chartData} color={METRIC_COLORS[activeMetric]} />
                </div>
              )}

              {/* History list */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">History</p>
                {[...measurements].reverse().map(m => (
                  <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{formatDate(m.date)}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {(Object.keys(METRIC_LABELS) as MetricKey[]).map(key => {
                            const val = m[key]
                            if (val == null) return null
                            return (
                              <span key={key} className="text-xs text-gray-500">
                                {METRIC_LABELS[key].split(' ')[0]}: <strong className="text-gray-700">{val}</strong>
                              </span>
                            )
                          })}
                        </div>
                        {m.notes ? <p className="text-xs text-gray-500 mt-1 italic">{m.notes}</p> : null}
                      </div>
                      <button
                        onClick={() => deleteMeasurement(m.id)}
                        disabled={deletingId === m.id}
                        className="text-gray-500 hover:text-red-400 transition-colors text-sm ml-3 shrink-0"
                      >
                        {deletingId === m.id ? '...' : '✕'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Log measurement modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 pb-8" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
                <h2 className="text-lg font-bold text-gray-900">Log Measurements</h2>
                <p className="text-xs text-gray-500 mt-0.5">Fill in what you have — all fields are optional</p>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">⚖️ Weight (lbs)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.weight_lbs}
                    onChange={e => setForm(f => ({ ...f, weight_lbs: e.target.value }))}
                    placeholder="e.g. 142.5"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Body Measurements (inches)</p>

                <div className="grid grid-cols-2 gap-3">
                  {(['waist_in', 'hips_in', 'chest_in', 'arms_in', 'thighs_in'] as const).map(key => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">
                        {METRIC_LABELS[key].split(' ')[0]}
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={form[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder="e.g. 28"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. after morning workout"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-sm">{error}</div>
                )}
              </div>

              <div className="flex gap-2 shrink-0 border-t border-gray-100 px-5 py-4">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={saveMeasurement}
                  disabled={saving}
                  className="flex-grow py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold rounded-xl text-sm"
                >
                  {saving ? 'Saving...' : '✅ Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PlanGate>
  )
}
